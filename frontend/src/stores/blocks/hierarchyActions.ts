// Hierarchy and tree structure actions
import api from "@/services/api";
import { posBetween } from "@/domain/position";
import type { Block, BlocksStoreState } from "./types.js";

const KEY_ROOT = "root";
const parentKeyOf = (parentId: string | null): string =>
  parentId == null ? KEY_ROOT : String(parentId);

export function ensurePageMap(
  this: BlocksStoreState & {
    childrenByParentId: Record<string, Record<string, string[]>>;
  },
  pageId: string | number,
): void {
  const pageIdStr = String(pageId);
  if (!this.childrenByParentId[pageIdStr]) {
    this.childrenByParentId[pageIdStr] = {};
  }
}

export function getKind(
  this: BlocksStoreState & { blocksById: Record<string, Block> },
  id: string | number,
): string {
  const n = this.blocksById[String(id)];
  return n?.kind ?? "block";
}

export function hasRowAncestor(
  this: BlocksStoreState & { blocksById: Record<string, Block> },
  blockId: string | number,
): boolean {
  let cur = String(blockId);
  while (true) {
    const node = this.blocksById[cur];
    if (!node) return false;

    const pid = node.parentId;
    if (!pid) return false;

    const parent = this.blocksById[String(pid)];
    if (!parent) return false;

    if ((parent.kind ?? "block") === "row") return true;
    cur = String(pid);
  }
}

export function sortSiblingsByPosition(
  this: BlocksStoreState & { blocksById: Record<string, Block> },
  ids: (string | number)[],
): void {
  ids.sort((a, b) => {
    const aStr = String(a);
    const bStr = String(b);
    const pa = this.blocksById[aStr]?.position ?? "\uffff";
    const pb = this.blocksById[bStr]?.position ?? "\uffff";
    return pa < pb ? -1 : pa > pb ? 1 : aStr.localeCompare(bStr);
  });
}

export function applyMoveLocal(
  this: BlocksStoreState & {
    blocksById: Record<string, Block>;
    childrenByParentId: Record<string, Record<string, string[]>>;
    ensurePageMap: (pageId: string | number) => void;
    sortSiblingsByPosition: (ids: (string | number)[]) => void;
  },
  pageId: string | number,
  blockId: string | number,
  {
    newParentId,
    newPosition,
  }: { newParentId: string | null; newPosition: string },
): boolean {
  const blockIdStr = String(blockId);
  const pageIdStr = String(pageId);
  const block = this.blocksById[blockIdStr];
  if (!block) return false;

  this.ensurePageMap(pageIdStr);

  const oldKey = parentKeyOf(block.parentId);
  const newKey = parentKeyOf(newParentId);

  // update metadata
  block.parentId = newParentId;
  block.position = newPosition;

  // remove from old list
  const oldList = (this.childrenByParentId[pageIdStr][oldKey] ?? [])
    .map(String)
    .filter((id: string) => id !== blockIdStr);
  this.childrenByParentId[pageIdStr][oldKey] = oldList;

  // insert into new list (avoid dup)
  const baseNew =
    oldKey === newKey
      ? oldList
      : (this.childrenByParentId[pageIdStr][newKey] ?? []).map(String);

  const nextNew = baseNew.filter((id: string) => id !== blockIdStr);
  nextNew.push(blockIdStr);
  this.childrenByParentId[pageIdStr][newKey] = nextNew;

  this.sortSiblingsByPosition(this.childrenByParentId[pageIdStr][newKey]);
  return true;
}

export function applyDeleteLocal(
  this: BlocksStoreState & {
    blocksById: Record<string, Block>;
    childrenByParentId: Record<string, Record<string, string[]>>;
    currentBlockId: string | null;
    optionsMenu: any;
    ensurePageMap: (pageId: string | number) => void;
    closeOptionsMenu: () => void;
  },
  pageId: string | number,
  blockId: string | number,
): boolean {
  const blockIdStr = String(blockId);
  const pageIdStr = String(pageId);
  const block = this.blocksById[blockIdStr];
  if (!block) return false;

  this.ensurePageMap(pageIdStr);

  const parentKey = parentKeyOf(block.parentId);
  const siblings = (this.childrenByParentId[pageIdStr][parentKey] ?? []).map(
    String,
  );

  // children of the block being deleted
  const selfKey = parentKeyOf(blockIdStr);
  const children = (this.childrenByParentId[pageIdStr][selfKey] ?? []).map(
    String,
  );

  // replace the block with its children, maintaining position
  const idx = siblings.indexOf(blockIdStr);
  const nextSiblings =
    idx === -1
      ? siblings.filter((id: string) => id !== blockIdStr)
      : [...siblings.slice(0, idx), ...children, ...siblings.slice(idx + 1)];

  this.childrenByParentId[pageIdStr][parentKey] = nextSiblings;

  // re-parent children
  for (const childId of children) {
    const child = this.blocksById[String(childId)];
    if (child) child.parentId = block.parentId;
  }

  // clean up children list of deleted block
  delete this.childrenByParentId[pageIdStr][selfKey];

  // delete only the block
  delete this.blocksById[blockIdStr];

  if (this.currentBlockId === blockIdStr) this.currentBlockId = null;
  if (this.optionsMenu?.blockId === blockIdStr) this.closeOptionsMenu();

  return true;
}

export function getParentKeyOf(
  this: BlocksStoreState,
  parentId: string | null,
): string {
  return parentKeyOf(parentId);
}

export async function indentBlock(
  this: BlocksStoreState & {
    blocksById: Record<string, Block>;
    childrenByParentId: Record<string, Record<string, string[]>>;
    hasRowAncestor: (blockId: string | number) => boolean;
    ensurePageMap: (pageId: string | number) => void;
    applyMoveLocal: (
      pageId: string | number,
      blockId: string | number,
      params: { newParentId: string | null; newPosition: string },
    ) => boolean;
    patchBlock: (
      blockId: string | number,
      payload: Record<string, any>,
    ) => Promise<any>;
    fetchBlocksForPage: (pageId: string | number) => Promise<void>;
  },
  pageId: string | number,
  blockId: string | number,
): Promise<void> {
  if (this.hasRowAncestor(blockId)) return;
  const blockIdStr = String(blockId);
  const pageIdStr = String(pageId);
  const block = this.blocksById[blockIdStr];
  if (!block) return;

  this.ensurePageMap(pageIdStr);

  const oldKey = parentKeyOf(block.parentId);
  const siblings = (this.childrenByParentId[pageIdStr][oldKey] ?? []).map(
    String,
  );
  const idx = siblings.indexOf(blockIdStr);
  if (idx <= 0) return;

  const newParentId = siblings[idx - 1];
  const prev = this.blocksById[String(newParentId)];
  if (!prev || (prev.kind ?? "block") !== "block") return;
  if (this.hasRowAncestor(newParentId)) return;

  const newKey = parentKeyOf(newParentId);
  const newSiblings = (this.childrenByParentId[pageIdStr][newKey] ?? []).map(
    String,
  );

  const lastId = newSiblings[newSiblings.length - 1] ?? null;
  const lastPos = lastId
    ? (this.blocksById[String(lastId)]?.position ?? null)
    : null;
  const newPos = posBetween(lastPos, null);

  this.applyMoveLocal(pageIdStr, blockIdStr, {
    newParentId,
    newPosition: newPos,
  });

  try {
    await this.patchBlock(blockIdStr, {
      parent_block: newParentId,
      position: newPos,
    });
  } catch (e) {
    await this.fetchBlocksForPage(pageIdStr);
    throw e;
  }
}

export async function outdentBlock(
  this: BlocksStoreState & {
    blocksById: Record<string, Block>;
    childrenByParentId: Record<string, Record<string, string[]>>;
    hasRowAncestor: (blockId: string | number) => boolean;
    ensurePageMap: (pageId: string | number) => void;
    applyMoveLocal: (
      pageId: string | number,
      blockId: string | number,
      params: { newParentId: string | null; newPosition: string },
    ) => boolean;
    patchBlock: (
      blockId: string | number,
      payload: Record<string, any>,
    ) => Promise<any>;
    fetchBlocksForPage: (pageId: string | number) => Promise<void>;
  },
  pageId: string | number,
  blockId: string | number,
): Promise<void> {
  if (this.hasRowAncestor(blockId)) return;
  const blockIdStr = String(blockId);
  const pageIdStr = String(pageId);
  const block = this.blocksById[blockIdStr];
  if (!block?.parentId) return;

  this.ensurePageMap(pageIdStr);

  const oldParentId = String(block.parentId);
  const oldParent = this.blocksById[oldParentId];
  if (!oldParent) return;

  const newParentId = oldParent.parentId ?? null;
  const oldKey = parentKeyOf(oldParentId);
  const newKey = parentKeyOf(newParentId);

  const siblings = (this.childrenByParentId[pageIdStr][oldKey] ?? []).map(
    String,
  );
  const idx = siblings.indexOf(blockIdStr);
  if (idx === -1) return;

  const adoptedChildren = siblings.slice(idx + 1);

  const parentSiblings = (this.childrenByParentId[pageIdStr][newKey] ?? []).map(
    String,
  );
  const parentIdx = parentSiblings.indexOf(oldParentId);

  const prevPos = oldParent.position ?? null;
  const nextId =
    parentIdx >= 0 ? (parentSiblings[parentIdx + 1] ?? null) : null;
  const nextPos = nextId
    ? (this.blocksById[String(nextId)]?.position ?? null)
    : null;
  const newPos = posBetween(prevPos, nextPos);

  // OPTIMISTIC LOCAL
  this.applyMoveLocal(pageIdStr, blockIdStr, {
    newParentId,
    newPosition: newPos,
  });
  this.childrenByParentId[pageIdStr][oldKey] = siblings.slice(0, idx);

  const blockKey = parentKeyOf(blockIdStr);
  const existingChildren = (
    this.childrenByParentId[pageIdStr][blockKey] ?? []
  ).map(String);
  const nextChildren = existingChildren.concat(adoptedChildren);
  this.childrenByParentId[pageIdStr][blockKey] = nextChildren;

  for (const cid of adoptedChildren) {
    const child = this.blocksById[cid];
    if (child) child.parentId = blockIdStr;
  }

  // PERSIST
  try {
    await this.patchBlock(blockIdStr, {
      parent_block: newParentId,
      position: newPos,
    });

    for (const cid of adoptedChildren) {
      await this.patchBlock(cid, { parent_block: blockIdStr });
    }
  } catch (e) {
    await this.fetchBlocksForPage(pageIdStr);
    throw e;
  }
}

export function isCircularMove(
  this: BlocksStoreState,
  draggedId: string | number,
  targetParentId: string | number | null,
  blocksById: Record<string, Block>,
): boolean {
  if (!targetParentId || targetParentId === "root") return false;
  if (String(draggedId) === String(targetParentId)) return true;

  let currentParentId: string | null = String(targetParentId);
  const drag = String(draggedId);

  while (currentParentId) {
    if (currentParentId === drag) return true;
    const parentNode: Block | undefined = blocksById[currentParentId];
    if (!parentNode) break;
    currentParentId =
      parentNode.parentId != null ? String(parentNode.parentId) : null;
  }

  return false;
}
