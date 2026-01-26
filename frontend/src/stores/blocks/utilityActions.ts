// Selection, focus, and local state management actions
import { normalizeProps } from "@/theme/colorsCatalog";
import { DEFAULT_BLOCK_TYPE } from "@/domain/blockTypes";
import type {
  Block,
  Transaction,
  BlocksStoreState,
  FocusRequest,
  OptionsMenu,
  UndoEntry,
} from "./types.js";

const KEY_ROOT = "root";
const parentKeyOf = (parentId: string | null): string =>
  parentId == null ? KEY_ROOT : String(parentId);

export function applyCreateLocal(
  this: BlocksStoreState & {
    blocksById: Record<string, Block>;
    childrenByParentId: Record<string, Record<string, string[]>>;
    ensurePageMap: (pageId: string | number) => void;
    sortSiblingsByPosition: (ids: (string | number)[]) => void;
  },
  pageId: string | number,
  rawNode: any,
): boolean {
  const pageIdStr = String(pageId);
  const node: Block = {
    id: String(rawNode.id),
    pageId: String(rawNode.pageId ?? pageIdStr),
    parentId: rawNode.parentId == null ? null : String(rawNode.parentId),
    kind: rawNode.kind ?? "block",
    type: rawNode.type ?? DEFAULT_BLOCK_TYPE,
    content: rawNode.content ?? { text: "" },
    layout: rawNode.layout ?? {},
    width: rawNode.width ?? null,
    position: String(rawNode.position ?? ""),
    version: rawNode.version ?? 1,
    updatedAt: rawNode.updatedAt ?? null,
    props: normalizeProps(rawNode.props),
  };

  this.blocksById[node.id] = node;

  this.ensurePageMap(pageIdStr);
  const key = parentKeyOf(node.parentId);
  const current = (this.childrenByParentId[pageIdStr][key] ?? []).map(String);
  if (!current.includes(node.id)) {
    current.push(node.id);
  }
  this.childrenByParentId[pageIdStr][key] = current;
  this.sortSiblingsByPosition(current);

  if (!this.blocksByPage[pageIdStr]) this.blocksByPage[pageIdStr] = [];
  const pageBlocks = this.blocksByPage[pageIdStr].map(String);
  if (!pageBlocks.includes(node.id)) {
    pageBlocks.push(node.id);
    this.blocksByPage[pageIdStr] = pageBlocks;
  }

  return true;
}

export function applyUpdateLocal(
  this: BlocksStoreState & { blocksById: Record<string, Block> },
  blockId: string | number,
  patch: Partial<Block>,
): boolean {
  const blockIdStr = String(blockId);
  const b = this.blocksById[blockIdStr];
  if (!b) return false;

  Object.assign(b, patch);
  return true;
}

export function applyTransactionLocal(
  this: BlocksStoreState & {
    applyCreateLocal: (pageId: string | number, rawNode: any) => boolean;
    applyMoveLocal: (
      pageId: string | number,
      blockId: string | number,
      params: { newParentId: string | null; newPosition: string },
    ) => boolean;
    applyUpdateLocal: (
      blockId: string | number,
      patch: Partial<Block>,
    ) => boolean;
    applyDeleteLocal: (
      pageId: string | number,
      blockId: string | number,
    ) => boolean;
  },
  pageId: string | number,
  tx: Transaction,
): boolean {
  for (const op of tx.ops ?? []) {
    if (op.op === "create") {
      this.applyCreateLocal(pageId, op.node);
    } else if (op.op === "move") {
      if (op.id != null && op.position != null) {
        this.applyMoveLocal(pageId, op.id, {
          newParentId: op.parentId ?? null,
          newPosition: String(op.position),
        });
      }
    } else if (op.op === "update") {
      if (op.id != null && op.patch != null) {
        this.applyUpdateLocal(op.id, op.patch);
      }
    } else if (op.op === "delete") {
      if (op.id != null) {
        this.applyDeleteLocal(pageId, op.id);
      }
    }
  }
  return true;
}

export function makeTempId(
  _this: BlocksStoreState,
  prefix: string = "tmp",
): string {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${ts}_${rnd}`;
}

export function rebuildPageIndex(
  this: BlocksStoreState & {
    blocksById: Record<string, Block>;
    blocksByPage: Record<string, string[]>;
    childrenByParentId: Record<string, Record<string, string[]>>;
    sortSiblingsByPosition: (ids: (string | number)[]) => void;
  },
  pageId: string | number,
): void {
  const pageIdStr = String(pageId);
  const blocks = Object.values(this.blocksById).filter(
    (b) => b.pageId === pageIdStr,
  );

  this.blocksByPage[pageIdStr] = blocks.map((b) => b.id);

  const pageMap = blocks.reduce((dict: Record<string, string[]>, b) => {
    const parentKey = parentKeyOf(b.parentId);
    if (!dict[parentKey]) dict[parentKey] = [];
    dict[parentKey].push(b.id);
    return dict;
  }, {});

  Object.values(pageMap).forEach((ids) => this.sortSiblingsByPosition(ids));
  this.childrenByParentId[pageIdStr] = pageMap;
}

export function reconcileTempIds(
  this: BlocksStoreState & {
    blocksById: Record<string, Block>;
    blocksByPage: Record<string, string[]>;
    childrenByParentId: Record<string, Record<string, string[]>>;
    currentBlockId: string | null;
    focusRequestId: FocusRequest | null;
    optionsMenu: OptionsMenu;
    expandedById: Record<string, boolean>;
  },
  map: Record<string, string>,
): void {
  const entries = Object.entries(map ?? {});
  if (!entries.length) return;

  for (const [tempRaw, realRaw] of entries) {
    const tempId = String(tempRaw);
    const realId = String(realRaw);
    if (!tempId || tempId === realId) continue;

    const tempBlock = this.blocksById[tempId];
    if (tempBlock) {
      tempBlock.id = realId;
      this.blocksById[realId] = tempBlock;
      delete this.blocksById[tempId];
    }

    for (const b of Object.values(this.blocksById)) {
      if (b.parentId === tempId) b.parentId = realId;
    }

    for (const pageId in this.blocksByPage) {
      const next = (this.blocksByPage[pageId] ?? []).map((id) =>
        String(id) === tempId ? realId : String(id),
      );
      this.blocksByPage[pageId] = Array.from(new Set(next));
    }

    for (const pageId in this.childrenByParentId) {
      const pageMap = this.childrenByParentId[pageId];
      if (pageMap[tempId]) {
        const merged = pageMap[realId]
          ? [...pageMap[realId], ...pageMap[tempId]]
          : [...pageMap[tempId]];
        pageMap[realId] = Array.from(new Set(merged));
        delete pageMap[tempId];
      }
      for (const key in pageMap) {
        const next = pageMap[key]
          .map((id) => (String(id) === tempId ? realId : String(id)))
          .filter(Boolean);
        pageMap[key] = Array.from(new Set(next));
      }
    }

    if (this.currentBlockId === tempId) this.currentBlockId = realId;
    if (this.focusRequestId?.blockId === tempId)
      this.focusRequestId.blockId = realId;
    if (this.optionsMenu?.blockId === tempId) this.optionsMenu.blockId = realId;

    if (this.expandedById[tempId] != null) {
      this.expandedById[realId] = this.expandedById[tempId];
      delete this.expandedById[tempId];
    }
  }
}

export function replaceTempBlock(
  this: BlocksStoreState & {
    blocksById: Record<string, Block>;
    reconcileTempIds: (map: Record<string, string>) => void;
  },
  tempId: string,
  next: Block,
): void {
  const tempIdStr = String(tempId);
  const realId = String(next.id);
  if (tempIdStr && tempIdStr !== realId) {
    this.reconcileTempIds({ [tempIdStr]: realId });
  }
  this.blocksById[realId] = next;
}

export function removeBlocksLocal(
  this: BlocksStoreState & {
    blocksById: Record<string, Block>;
    blocksByPage: Record<string, string[]>;
    childrenByParentId: Record<string, Record<string, string[]>>;
    currentBlockId: string | null;
    focusRequestId: FocusRequest | null;
    optionsMenu: OptionsMenu;
    expandedById: Record<string, boolean>;
  },
  blockIds: (string | number)[],
): void {
  const ids = blockIds.map(String);
  const idSet = new Set(ids);

  const idsByPage: Record<string, string[]> = {};
  for (const id of ids) {
    const b = this.blocksById[id];
    if (!b) continue;
    if (!idsByPage[b.pageId]) idsByPage[b.pageId] = [];
    idsByPage[b.pageId].push(id);
  }

  for (const id of ids) {
    delete this.blocksById[id];
    delete this.expandedById[id];

    if (this.currentBlockId === id) this.currentBlockId = null;
    if (this.focusRequestId?.blockId === id) this.focusRequestId = null;
    if (this.optionsMenu?.blockId === id)
      this.optionsMenu = { open: false, blockId: null, anchorRect: null };
  }

  for (const pageId in idsByPage) {
    const pageIds = new Set(idsByPage[pageId]);

    const pageList = (this.blocksByPage[pageId] ?? []).filter(
      (id) => !pageIds.has(String(id)),
    );
    this.blocksByPage[pageId] = pageList;

    const pageMap = this.childrenByParentId[pageId];
    if (!pageMap) continue;

    for (const key of Object.keys(pageMap)) {
      if (idSet.has(String(key))) {
        delete pageMap[key];
        continue;
      }
      pageMap[key] = (pageMap[key] ?? []).filter(
        (id) => !pageIds.has(String(id)),
      );
    }
  }
}

export function pushUndoEntry(
  this: BlocksStoreState & {
    _undoStack: UndoEntry[];
    _redoStack: UndoEntry[];
  },
  entry: UndoEntry,
): void {
  const enriched: UndoEntry = {
    ...entry,
    createdAt: entry.createdAt ?? Date.now(),
  };
  this._undoStack = [...(this._undoStack ?? []), enriched];
  this._redoStack = [];
}

export async function undoLastEntry(
  this: BlocksStoreState & {
    _undoStack: UndoEntry[];
    _redoStack: UndoEntry[];
    applyTransactionLocal: (
      pageId: string | number,
      tx: Transaction,
    ) => boolean;
    persistTransaction: (
      pageId: string | number,
      tx: Transaction,
    ) => Promise<void>;
    fetchBlocksForPage: (pageId: string | number) => Promise<void>;
  },
  pageId?: string | number,
): Promise<void> {
  const stack = this._undoStack ?? [];
  const entry = stack.pop();
  if (!entry) return;

  const targetPageId = pageId ?? entry.pageId;
  this._undoStack = stack;

  this.applyTransactionLocal(targetPageId, entry.undo);
  try {
    await this.persistTransaction(targetPageId, entry.undo);
    if (entry.redo) {
      this._redoStack = [...(this._redoStack ?? []), entry];
    }
  } catch (error) {
    await this.fetchBlocksForPage(targetPageId);
    throw error;
  }
}

export async function redoLastEntry(
  this: BlocksStoreState & {
    _undoStack: UndoEntry[];
    _redoStack: UndoEntry[];
    applyTransactionLocal: (
      pageId: string | number,
      tx: Transaction,
    ) => boolean;
    persistTransaction: (
      pageId: string | number,
      tx: Transaction,
    ) => Promise<void>;
    fetchBlocksForPage: (pageId: string | number) => Promise<void>;
  },
  pageId?: string | number,
): Promise<void> {
  const stack = this._redoStack ?? [];
  const entry = stack.pop();
  if (!entry?.redo) return;

  const targetPageId = pageId ?? entry.pageId;
  this._redoStack = stack;

  this.applyTransactionLocal(targetPageId, entry.redo);
  try {
    await this.persistTransaction(targetPageId, entry.redo);
    this._undoStack = [...(this._undoStack ?? []), entry];
  } catch (error) {
    await this.fetchBlocksForPage(targetPageId);
    throw error;
  }
}

export function setCurrentBlock(
  this: BlocksStoreState & { currentBlockId: string | null },
  blockId: string | number,
): void {
  this.currentBlockId = String(blockId);
}

export function clearCurrentBlock(
  this: BlocksStoreState & { currentBlockId: string | null },
): void {
  this.currentBlockId = null;
}

export function requestFocus(
  this: BlocksStoreState & { focusRequestId: FocusRequest | null },
  blockId: string | number,
  caret: number = 0,
): void {
  this.focusRequestId = { blockId: String(blockId), caret };
}

export function clearFocusRequest(
  this: BlocksStoreState & { focusRequestId: FocusRequest | null },
): void {
  this.focusRequestId = null;
}

export function closeOptionsMenu(
  this: BlocksStoreState & { optionsMenu: OptionsMenu },
): void {
  this.optionsMenu = { open: false, blockId: null, anchorRect: null };
}

export function isExpanded(
  this: BlocksStoreState & {
    blocksById: Record<string, Block>;
    expandedById: Record<string, boolean>;
  },
  blockId: string | number,
): boolean {
  const blockIdStr = String(blockId);
  const block = this.blocksById[blockIdStr];
  if (!block) return false;
  if (block.type === "toggle") {
    return block.content?.isExpanded ?? false;
  }
  //return this.expandedById[blockIdStr] ?? false;
  return true;
}

export function expandBlock(
  this: BlocksStoreState & {
    blocksById: Record<string, Block>;
    expandedById: Record<string, boolean>;
  },
  blockId: string | number,
): void {
  const blockIdStr = String(blockId);
  const block = this.blocksById[blockIdStr];
  //if (block?.type === "toggle") return;
  this.expandedById[blockIdStr] = true;
}

export function toggleExpandBlock(
  this: BlocksStoreState & {
    blocksById: Record<string, Block>;
    expandedById: Record<string, boolean>;
  },
  blockId: string | number,
): void {
  const blockIdStr = String(blockId);
  const block = this.blocksById[blockIdStr];
  if (!block) return;

  //if (block.type === "toggle") return;

  const currentState = this.expandedById[blockIdStr] ?? false;
  this.expandedById[blockIdStr] = !currentState;
}

export function collapseAll(
  this: BlocksStoreState & { expandedById: Record<string, boolean> },
): void {
  this.expandedById = {};
}
