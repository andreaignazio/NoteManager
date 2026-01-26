// Selection, focus, and local state management actions
import { normalizeProps } from "@/theme/colorsCatalog";
import { DEFAULT_BLOCK_TYPE } from "@/domain/blockTypes";
import type {
  Block,
  Transaction,
  BlocksStoreState,
  FocusRequest,
  OptionsMenu,
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
      if (op.id != null && op.parentId != null && op.position != null) {
        this.applyMoveLocal(pageId, op.id, {
          newParentId: op.parentId,
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
  return this.expandedById[blockIdStr] ?? false;
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
  if (block?.type === "toggle") return;
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

  if (block.type === "toggle") return;

  const currentState = this.expandedById[blockIdStr] ?? false;
  this.expandedById[blockIdStr] = !currentState;
}

export function collapseAll(
  this: BlocksStoreState & { expandedById: Record<string, boolean> },
): void {
  this.expandedById = {};
}
