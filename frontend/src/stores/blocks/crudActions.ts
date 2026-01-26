// CRUD operations for creating and batch adding blocks
import api from "@/services/api";
import { DEFAULT_BLOCK_TYPE } from "@/domain/blockTypes";
import { posBetween, posNBetween } from "@/domain/position";
import { normalizeBlock } from "./syncActions";
import type {
  Block,
  BlockContent,
  BatchBlockItem,
  BatchAddResponse,
  BlocksStoreState,
  BaseCreateBlockPayload,
  IdLike,
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
    applyCreateLocal: (pageId: string | number, rawNode: any) => boolean;
    replaceTempBlock: (tempId: string, next: Block) => void;
    makeTempId: (prefix?: string) => string;
    fetchBlocksForPage: (pageId: string | number) => Promise<void>;
  },
  pageId: string | number,
  payload: { type?: string; content?: BlockContent },
  blockId: string | number | null,
): Promise<string> {
  const normalizeParentForApi = (
    pid: string | number | null | undefined,
  ): string | null => {
    if (pid === undefined || pid === null) return null;
    const raw = String(pid);
    if (raw === "root" || raw === "null" || raw === "undefined") return null;
    return raw;
  };

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
        parent_block: normalizeParentForApi(anchor.parentId),
        position: newPos,
      };
    }

    const tempId = this.makeTempId("blk");
    this.applyCreateLocal(pageIdStr, {
      id: tempId,
      pageId: pageIdStr,
      parentId: postData.parent_block ?? null,
      kind: "block",
      type: postData.type,
      content: postData.content,
      props: postData.props ?? {},
      layout: postData.layout ?? {},
      width: postData.width ?? null,
      position: postData.position,
      version: 1,
      updatedAt: null,
    });

    const res = await api.post(`/pages/${pageIdStr}/blocks/`, postData);
    const normalized = normalizeBlock(res.data as any);
    this.replaceTempBlock(tempId, normalized);
    return String(normalized.id);
  } catch (error) {
    console.warn(
      "Error adding new block:",
      (error as any)?.response?.data ?? error,
    );
    await this.fetchBlocksForPage(pageIdStr);
    throw error;
  }
}

export async function addBlockAfterWithParent<
  TExtra extends Record<string, any> = Record<string, never>,
>(
  this: BlocksStoreState & {
    blocksById: Record<string, Block>;
    childrenByParentId: Record<string, Record<string, string[]>>;
    applyCreateLocal: (pageId: string | number, rawNode: any) => boolean;
    replaceTempBlock: (tempId: string, next: Block) => void;
    makeTempId: (prefix?: string) => string;
    fetchBlocksForPage: (pageId: string | number) => Promise<void>;
  },
  pageId: string | number,
  base: BaseCreateBlockPayload,
  opts?: {
    afterBlockId?: IdLike;
    parentId?: IdLike;
    extra?: TExtra;
  },
): Promise<string> {
  const normalizeParentForApi = (
    pid: string | number | null | undefined,
  ): string | null => {
    if (pid === undefined || pid === null) return null;
    const raw = String(pid);
    if (raw === "root" || raw === "null" || raw === "undefined") return null;
    return raw;
  };

  const pageIdStr = String(pageId);

  const afterBlockId = opts?.afterBlockId ?? null;
  const forcedParentId = opts?.parentId ?? null;
  const extra = (opts?.extra ?? {}) as TExtra;

  try {
    // 1) Determina il parent target
    // - se forzato: usa quello
    // - altrimenti: se ho un anchor, usa il parent dell'anchor, se no root
    let parentId: string | null;
    let parentKey: string;

    if (forcedParentId != null) {
      parentId = String(forcedParentId);
      // parentKeyOf gestisce sia root che parent reale? nel tuo codice parentKeyOf(anchor.parentId)
      parentKey = parentKeyOf(parentId);
    } else if (afterBlockId != null) {
      const anchor = this.blocksById[String(afterBlockId)];
      if (!anchor) throw new Error("anchor block not found");
      parentId = anchor.parentId ? String(anchor.parentId) : null;
      parentKey = parentKeyOf(anchor.parentId);
    } else {
      parentId = null;
      parentKey = KEY_ROOT;
    }

    // 2) Recupera siblings nel parent target
    const siblingsIds = this.childrenByParentId[pageIdStr]?.[parentKey] ?? [];

    // 3) Determina prev/next per il posBetween
    //    - se afterBlockId è fornito: inserisci dopo quell'id (ma solo se è nei siblings del parent target)
    //    - se afterBlockId è null: inserisci in coda ai siblings del parent target
    let prevPos: string | null = null;
    let nextPos: string | null = null;

    if (afterBlockId != null) {
      const afterIdStr = String(afterBlockId);
      const idx = siblingsIds.map(String).indexOf(afterIdStr);
      if (idx === -1) {
        throw new Error(
          `afterBlockId ${afterBlockId} not found in target parent siblings`,
        );
      }

      prevPos = this.blocksById[afterIdStr]?.position ?? null;

      const nextId = idx + 1 < siblingsIds.length ? siblingsIds[idx + 1] : null;
      nextPos = nextId
        ? (this.blocksById[String(nextId)]?.position ?? null)
        : null;
    } else {
      // append
      const lastId = siblingsIds.length
        ? siblingsIds[siblingsIds.length - 1]
        : null;
      prevPos = lastId
        ? (this.blocksById[String(lastId)]?.position ?? null)
        : null;
      nextPos = null;
    }

    const newPos = posBetween(prevPos, nextPos);

    // 4) Post data (payload generico)
    const postData: Record<string, any> = {
      type: base.type ?? DEFAULT_BLOCK_TYPE,
      content: base.content ?? { text: "" },
      parent_block: normalizeParentForApi(parentId), // <-- qui forzi davvero il parent
      position: newPos,
      ...extra, // <-- campi extra a piacere (es: properties, metadata, flags...)
    };

    const tempId = this.makeTempId("blk");
    this.applyCreateLocal(pageIdStr, {
      id: tempId,
      pageId: pageIdStr,
      parentId,
      kind: (extra as any)?.kind ?? "block",
      type: postData.type,
      content: postData.content,
      props: postData.props ?? (extra as any)?.props ?? {},
      layout: postData.layout ?? (extra as any)?.layout ?? {},
      width:
        typeof (extra as any)?.width === "undefined"
          ? null
          : (extra as any)?.width,
      position: postData.position,
      version: 1,
      updatedAt: null,
    });

    const res = await api.post(`/pages/${pageIdStr}/blocks/`, postData);
    const normalized = normalizeBlock(res.data as any);
    this.replaceTempBlock(tempId, normalized);
    return String(normalized.id);
  } catch (error) {
    console.warn(
      "Error adding new block:",
      (error as any)?.response?.data ?? error,
    );
    await this.fetchBlocksForPage(pageIdStr);
    throw error;
  }
}

export async function addNewBlockAfterAdoptChildren(
  this: BlocksStoreState & {
    childrenByParentId: Record<string, Record<string, string[]>>;
    blocksById: Record<string, Block>;
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
  const normalizeParentForApi = (
    pid: string | number | null | undefined,
  ): string | null => {
    if (pid === undefined || pid === null) return null;
    const raw = String(pid);
    if (raw === "root" || raw === "null" || raw === "undefined") return null;
    return raw;
  };

  const newId = await this.addNewBlockAfter(pageId, payload, blockId);

  const childKey = String(blockId);
  const childIds = this.childrenByParentId[String(pageId)]?.[childKey] ?? [];
  if (!childIds.length) return newId;

  const newKey = String(newId);
  this.childrenByParentId[String(pageId)][childKey] = [];
  this.childrenByParentId[String(pageId)][newKey] = childIds.map(String);
  for (const childId of childIds) {
    const child = this.blocksById[String(childId)];
    if (child) child.parentId = newKey;
  }

  try {
    const parentNorm = normalizeParentForApi(newId);
    for (const childId of childIds) {
      await api.patch(`/blocks/${childId}/`, { parent_block: parentNorm });
    }
    return newId;
  } catch (error) {
    await this.fetchBlocksForPage(pageId);
    throw error;
  }
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
    applyCreateLocal: (pageId: string | number, rawNode: any) => boolean;
    reconcileTempIds: (map: Record<string, string>) => void;
    makeTempId: (prefix?: string) => string;
    fetchBlocksForPage: (pageId: string | number) => Promise<void>;
  },
  pageId: string | number,
  afterBlockId: string | number | null,
  blocks: BatchBlockItem[],
  parentId?: string | number | null,
  opts?: { fetch?: boolean },
): Promise<BatchAddResponse> {
  const normalizeParentForApi = (
    pid: string | number | null | undefined,
  ): string | null => {
    if (pid === undefined || pid === null) return null;
    const raw = String(pid);
    if (raw === "root" || raw === "null" || raw === "undefined") return null;
    return raw;
  };

  const normalizeAfterForApi = (
    id: string | number | null | undefined,
  ): string | null => {
    if (id === undefined || id === null) return null;
    const raw = String(id);
    if (raw === "null" || raw === "undefined") return null;
    return raw;
  };

  const pageIdStr = String(pageId);
  const afterId = normalizeAfterForApi(afterBlockId);

  if (!Array.isArray(blocks) || blocks.length === 0) {
    return { ids: [], topLevelIds: [], map: {} };
  }

  try {
    let resolvedParentId: string | null = null;

    if (typeof parentId !== "undefined") {
      resolvedParentId = normalizeParentForApi(parentId);
    } else if (afterId) {
      const anchor = this.blocksById[afterId];
      if (!anchor) throw new Error("anchor block not found");
      resolvedParentId = normalizeParentForApi(anchor.parentId);
    } else {
      resolvedParentId = null;
    }

    const payload = {
      parent_block: normalizeParentForApi(resolvedParentId),
      after_block_id: normalizeAfterForApi(afterId),
      blocks: blocks.map((b, i) =>
        this.mapBatchItem(b, b.tempId ?? this.makeTempId(`t${i}`)),
      ),
    };

    console.log("PAYLOAD BLOCKS:", JSON.stringify(payload.blocks, null, 2));

    const parentKey = parentKeyOf(resolvedParentId);
    const siblings = this.childrenByParentId[pageIdStr]?.[parentKey] ?? [];
    const siblingsIds = siblings.map(String);

    let prevPos: string | null = null;
    let nextPos: string | null = null;

    if (afterId) {
      const idx = siblingsIds.indexOf(afterId);
      if (idx === -1) {
        throw new Error(
          `afterBlockId ${afterId} not found in target parent siblings`,
        );
      }
      prevPos = this.blocksById[afterId]?.position ?? null;
      const nextId = idx + 1 < siblingsIds.length ? siblingsIds[idx + 1] : null;
      nextPos = nextId
        ? (this.blocksById[String(nextId)]?.position ?? null)
        : null;
    } else {
      const lastId = siblingsIds.length
        ? siblingsIds[siblingsIds.length - 1]
        : null;
      prevPos = lastId
        ? (this.blocksById[String(lastId)]?.position ?? null)
        : null;
      nextPos = null;
    }

    const topLevelItems = payload.blocks as BatchBlockItem[];
    const topPositions = posNBetween(prevPos, nextPos, topLevelItems.length);

    const createTree = (
      items: BatchBlockItem[],
      parentId: string | null,
      positions: string[],
    ) => {
      items.forEach((item, idx) => {
        const nodeId = String(item.tempId ?? this.makeTempId("t"));
        this.applyCreateLocal(pageIdStr, {
          id: nodeId,
          pageId: pageIdStr,
          parentId,
          kind: item.kind ?? "block",
          type: item.type ?? DEFAULT_BLOCK_TYPE,
          content: item.content ?? {},
          props: item.props ?? {},
          layout: item.layout ?? {},
          width: typeof item.width === "undefined" ? null : (item.width as any),
          position: positions[idx] ?? posBetween(null, null),
          version: 1,
          updatedAt: null,
        });

        const children = item.children ?? [];
        if (children.length) {
          const childPositions = posNBetween(null, null, children.length);
          createTree(children, nodeId, childPositions);
        }
      });
    };

    createTree(topLevelItems, resolvedParentId, topPositions);

    const res = await api.post(`/pages/${pageIdStr}/blocks/batch/`, payload);

    const ids = (res.data?.ids || []).map(String);
    const topLevelIds = (res.data?.topLevelIds || []).map(String);
    const map = res.data?.map || {};

    if (map && Object.keys(map).length) {
      this.reconcileTempIds(map);
    }

    return { ids, topLevelIds, map };
  } catch (error) {
    console.warn(
      "Error batch adding blocks:",
      (error as any)?.response?.data ?? error,
    );
    await this.fetchBlocksForPage(pageIdStr);
    throw error;
  }
}
