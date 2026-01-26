// CRUD operations for creating and batch adding blocks
import api from "@/services/api";
import { DEFAULT_BLOCK_TYPE } from "@/domain/blockTypes";
import { posBetween } from "@/domain/position";
import type {
  Block,
  BlockContent,
  BatchBlockItem,
  BatchAddResponse,
  BlocksStoreState,
} from "./types.js";

const KEY_ROOT = "root";
const parentKeyOf = (parentId: string | null): string =>
  parentId == null ? KEY_ROOT : String(parentId);

export async function addNewBlock(
  this: BlocksStoreState & {
    childrenByParentId: Record<string, Record<string, string[]>>;
    addNewBlockAfterAdoptChildren: (
      pageId: string | number,
      payload: { type?: string; content?: BlockContent },
      blockId: string | number | null,
    ) => Promise<string>;
    addNewBlockAfter: (
      pageId: string | number,
      payload: { type?: string; content?: BlockContent },
      blockId: string | number | null,
    ) => Promise<string>;
  },
  pageId: string | number,
  payload: { type?: string; content?: BlockContent },
  blockId: string | number | null,
): Promise<string> {
  const key = String(blockId);
  const childIds = this.childrenByParentId[String(pageId)]?.[key] ?? [];
  const hasChildren = childIds.length > 0;

  if (hasChildren) {
    return await this.addNewBlockAfterAdoptChildren(pageId, payload, blockId);
  }
  return await this.addNewBlockAfter(pageId, payload, blockId);
}

export async function addNewBlockAfter(
  this: BlocksStoreState & {
    blocksById: Record<string, Block>;
    childrenByParentId: Record<string, Record<string, string[]>>;
    fetchBlocksForPage: (pageId: string | number) => Promise<void>;
  },
  pageId: string | number,
  payload: { type?: string; content?: BlockContent },
  blockId: string | number | null,
): Promise<string> {
  const pageIdStr = String(pageId);
  try {
    let postData: Record<string, any>;

    if (!blockId) {
      const parentKey = KEY_ROOT;
      const rootIds = this.childrenByParentId[pageIdStr]?.[parentKey] ?? [];
      const lastId = rootIds.length ? rootIds[rootIds.length - 1] : null;
      const lastPos = lastId
        ? (this.blocksById[String(lastId)]?.position ?? null)
        : null;
      const newPos = posBetween(lastPos, null);

      postData = {
        type: payload.type ?? DEFAULT_BLOCK_TYPE,
        content: payload.content ?? { text: "" },
        parent_block: null,
        position: newPos,
      };
    } else {
      const blockIdStr = String(blockId);
      const anchor = this.blocksById[blockIdStr];
      if (!anchor) throw new Error("anchor block not found");

      const parentKey = parentKeyOf(anchor.parentId);
      const siblingsIds = this.childrenByParentId[pageIdStr]?.[parentKey] ?? [];
      const idx = siblingsIds.map(String).indexOf(blockIdStr);
      if (idx === -1)
        throw new Error(`blockId ${blockId} not found in siblings`);

      const prevPos = this.blocksById[blockIdStr]?.position ?? null;
      const nextId = idx + 1 < siblingsIds.length ? siblingsIds[idx + 1] : null;
      const nextPos = nextId
        ? (this.blocksById[String(nextId)]?.position ?? null)
        : null;
      const newPos = posBetween(prevPos, nextPos);

      postData = {
        type: payload.type ?? DEFAULT_BLOCK_TYPE,
        content: payload.content ?? { text: "" },
        parent_block: anchor.parentId,
        position: newPos,
      };
    }

    const res = await api.post(`/pages/${pageIdStr}/blocks/`, postData);
    await this.fetchBlocksForPage(pageIdStr);
    return String(res.data.id);
  } catch (error) {
    console.warn(
      "Error adding new block:",
      (error as any)?.response?.data ?? error,
    );
    throw error;
  }
}

export async function addNewBlockAfterAdoptChildren(
  this: BlocksStoreState & {
    childrenByParentId: Record<string, Record<string, string[]>>;
    addNewBlockAfter: (
      pageId: string | number,
      payload: { type?: string; content?: BlockContent },
      blockId: string | number | null,
    ) => Promise<string>;
    fetchBlocksForPage: (pageId: string | number) => Promise<void>;
  },
  pageId: string | number,
  payload: { type?: string; content?: BlockContent },
  blockId: string | number | null,
): Promise<string> {
  const newId = await this.addNewBlockAfter(pageId, payload, blockId);

  const childKey = String(blockId);
  const childIds = this.childrenByParentId[String(pageId)]?.[childKey] ?? [];
  if (!childIds.length) return newId;

  for (const childId of childIds) {
    await api.patch(`/blocks/${childId}/`, { parent_block: newId });
  }

  await this.fetchBlocksForPage(pageId);
  return newId;
}

export function mapBatchItem(
  this: BlocksStoreState & {
    mapBatchItem: (b: BatchBlockItem, fallbackTempId: string) => BatchBlockItem;
  },
  b: BatchBlockItem,
  fallbackTempId: string,
): BatchBlockItem {
  const tempId = b.tempId || fallbackTempId;

  return {
    tempId,
    kind: b.kind || "block",
    type: b.type || DEFAULT_BLOCK_TYPE,
    content: b.content || {},
    props: b.props || {},
    layout: b.layout || {},
    width: typeof b.width === "undefined" ? null : b.width,
    children: Array.isArray(b.children)
      ? b.children.map((c, j) => this.mapBatchItem(c, `${tempId}_${j}`))
      : undefined,
  };
}

export async function batchAddBlocksAfter(
  this: BlocksStoreState & {
    blocksById: Record<string, Block>;
    mapBatchItem: (b: BatchBlockItem, fallbackTempId: string) => BatchBlockItem;
    fetchBlocksForPage: (pageId: string | number) => Promise<void>;
  },
  pageId: string | number,
  afterBlockId: string | number | null,
  blocks: BatchBlockItem[],
  parentId?: string | number | null,
  opts?: { fetch?: boolean },
): Promise<BatchAddResponse> {
  const pageIdStr = String(pageId);
  const afterId = afterBlockId ? String(afterBlockId) : null;

  if (!Array.isArray(blocks) || blocks.length === 0) {
    return { ids: [], topLevelIds: [], map: {} };
  }

  const doFetch = opts?.fetch !== false;

  try {
    let resolvedParentId: string | null = null;

    if (typeof parentId !== "undefined") {
      resolvedParentId = parentId ? String(parentId) : null;
    } else if (afterId) {
      const anchor = this.blocksById[afterId];
      if (!anchor) throw new Error("anchor block not found");
      resolvedParentId = anchor.parentId ? String(anchor.parentId) : null;
    } else {
      resolvedParentId = null;
    }

    const payload = {
      parent_block: resolvedParentId,
      after_block_id: afterId,
      blocks: blocks.map((b, i) => this.mapBatchItem(b, `t${i}`)),
    };

    const res = await api.post(`/pages/${pageIdStr}/blocks/batch/`, payload);

    const ids = (res.data?.ids || []).map(String);
    const topLevelIds = (res.data?.topLevelIds || []).map(String);
    const map = res.data?.map || {};

    if (doFetch) {
      await this.fetchBlocksForPage(pageIdStr);
    }

    return { ids, topLevelIds, map };
  } catch (error) {
    console.warn(
      "Error batch adding blocks:",
      (error as any)?.response?.data ?? error,
    );
    throw error;
  }
}
