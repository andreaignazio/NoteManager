// API synchronization and fetching actions
import api from "@/services/api";
import { DEFAULT_BLOCK_TYPE } from "@/domain/blockTypes";
import { posBetween } from "@/domain/position";
import { normalizeProps } from "@/theme/colorsCatalog";
import type {
  Block,
  RawBlock,
  Transaction,
  BlocksStoreState,
} from "./types.js";

const KEY_ROOT = "root";
const parentKeyOf = (parentId: string | null): string =>
  parentId == null ? KEY_ROOT : String(parentId);

export function normalizeBlock(raw: RawBlock): Block {
  return {
    id: String(raw.id),
    pageId: String(raw.page),
    parentId: raw.parent_block == null ? null : String(raw.parent_block),
    kind: raw.kind ?? "block",
    type: raw.type,
    content: raw.content ?? { text: "" },
    layout: raw.layout ?? {},
    width: raw.width ?? null,
    position: raw.position ?? "",
    version: raw.version ?? 1,
    updatedAt: raw.updated_at ?? null,
    props: normalizeProps(raw.props),
  };
}

export async function fetchBlocksForPage(
  this: BlocksStoreState & {
    blocksById: Record<string, Block>;
    blocksByPage: Record<string, string[]>;
    childrenByParentId: Record<string, Record<string, string[]>>;
    _fetchTokenByPage: Record<string, number>;
    addNewBlock: (
      pageId: string | number,
      payload: { type?: string; content?: any },
      blockId: string | number | null,
    ) => Promise<string>;
  },
  pageId: string | number,
): Promise<void> {
  const pageIdStr = String(pageId);
  const token = (this._fetchTokenByPage[pageIdStr] ?? 0) + 1;
  this._fetchTokenByPage[pageIdStr] = token;

  try {
    const response = await api.get(`/pages/${pageIdStr}/`);
    if (this._fetchTokenByPage[pageIdStr] !== token) return;

    console.log("Fetched page data:", response.data);
    const blocks = (response.data.blocks ?? []) as RawBlock[];
    const normBlocks = blocks.map((b) => normalizeBlock(b));

    console.log(
      "Parents snapshot",
      normBlocks.map((b) => ({
        id: b.id,
        type: b.type,
        parentId: b.parentId,
        parentKey: parentKeyOf(b.parentId),
      })),
    );

    // remember previous ids for this page
    const prevIds = (this.blocksByPage[pageIdStr] ?? []).map(String);

    // write/update fetched blocks
    for (const b of normBlocks) {
      this.blocksById[b.id] = b;
    }

    // update page ids list
    const nextIds = normBlocks.map((b) => b.id);
    this.blocksByPage[pageIdStr] = nextIds;

    // remove blocks that were in this page but are now gone
    const nextIdSet = new Set(nextIds);
    for (const id of prevIds) {
      if (nextIdSet.has(id)) continue;
      const old = this.blocksById[id];
      if (old?.pageId === pageIdStr) {
        delete this.blocksById[id];
      }
    }

    // rebuild children map for this page
    const pageMap = normBlocks.reduce((dict: Record<string, string[]>, b) => {
      const parentKey = parentKeyOf(b.parentId);
      if (!dict[parentKey]) dict[parentKey] = [];
      dict[parentKey].push(b.id);
      return dict;
    }, {});

    Object.values(pageMap).forEach((childIds) => {
      childIds.sort((idA, idB) => {
        const posA = this.blocksById[idA]?.position ?? "\uffff";
        const posB = this.blocksById[idB]?.position ?? "\uffff";
        const cmp = posA < posB ? -1 : posA > posB ? 1 : 0;
        return cmp !== 0 ? cmp : String(idA).localeCompare(String(idB));
      });
    });

    this.childrenByParentId[pageIdStr] = pageMap;
    console.log("Updated blocks store after fetch:", {
      blocksById: this.blocksById,
      blocksByPage: this.blocksByPage,
      childrenByParentId: this.childrenByParentId[pageIdStr],
    });
  } catch (error) {
    console.error("Error loading page:", error);
    throw error;
  }

  const anyBlockForPage = (this.blocksByPage[pageIdStr]?.length ?? 0) > 0;

  // If page is empty, create first block
  if (!anyBlockForPage) {
    await this.addNewBlock(
      pageIdStr,
      { type: DEFAULT_BLOCK_TYPE, content: { text: "" } },
      null,
    );
    return;
  }
}

export async function patchBlock(
  this: BlocksStoreState,
  blockId: string | number,
  payload: Record<string, any>,
): Promise<any> {
  try {
    const res = await api.patch(`/blocks/${blockId}/`, payload);
    return res.data;
  } catch (error) {
    console.warn(
      "Error patching block:",
      (error as any)?.response?.data ?? error,
    );
    throw error;
  }
}

export async function persistTransaction(
  this: BlocksStoreState & {
    patchBlock: (
      blockId: string | number,
      payload: Record<string, any>,
    ) => Promise<any>;
    fetchBlocksForPage: (pageId: string | number) => Promise<void>;
  },
  pageId: string | number,
  tx: Transaction,
): Promise<void> {
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
    for (const op of tx.ops ?? []) {
      if (op.op === "create") {
        const n = op.node;
        const payload = {
          id: n.id,
          kind: n.kind ?? "block",
          parent_block: normalizeParentForApi(n.parentId),
          position: String(n.position ?? ""),
          type: n.type ?? DEFAULT_BLOCK_TYPE,
          content: n.content ?? { text: "" },
          props: normalizeProps(n.props),
          layout: n.layout ?? {},
          width: n.width ?? null,
        };
        await api.post(`/pages/${pageIdStr}/blocks/`, payload);
        continue;
      }

      if (op.op === "move") {
        await this.patchBlock(String(op.id), {
          parent_block: normalizeParentForApi(op.parentId),
          position: String(op.position),
        });
        continue;
      }

      if (op.op === "update") {
        await this.patchBlock(String(op.id), op.patch ?? {});
        continue;
      }

      if (op.op === "delete") {
        await api.delete(`/blocks/${String(op.id)}/`);
        continue;
      }
    }
  } catch (e) {
    // hard resync
    await this.fetchBlocksForPage(pageIdStr);
    throw e;
  }
}

export async function moveBlock(
  this: BlocksStoreState & {
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
  { parentId, position }: { parentId: string | null; position: string },
): Promise<void> {
  const normalizeParentForApi = (
    pid: string | null | undefined,
  ): string | null => {
    if (pid === undefined || pid === null) return null;
    const raw = String(pid);
    if (raw === "root" || raw === "null" || raw === "undefined") return null;
    return raw;
  };

  const parentNorm = normalizeParentForApi(parentId);
  const pos = String(position);

  // optimistic local
  this.applyMoveLocal(pageId, blockId, {
    newParentId: parentNorm,
    newPosition: pos,
  });

  try {
    await this.patchBlock(String(blockId), {
      parent_block: parentNorm,
      position: pos,
    });
  } catch (e) {
    await this.fetchBlocksForPage(pageId);
    throw e;
  }
}

export async function deleteBlock(
  this: BlocksStoreState & {
    applyDeleteLocal: (
      pageId: string | number,
      blockId: string | number,
    ) => boolean;
    fetchBlocksForPage: (pageId: string | number) => Promise<void>;
  },
  blockId: string | number,
  pageId: string | number,
): Promise<void> {
  const blockIdStr = String(blockId);

  // optimistic local
  this.applyDeleteLocal(pageId, blockIdStr);

  try {
    await api.delete(`/blocks/${blockIdStr}/`);
  } catch (error) {
    console.warn(
      "Error deleting block:",
      (error as any)?.response?.data ?? error,
    );
    await this.fetchBlocksForPage(pageId);
    throw error;
  }
}

export async function transferSubtreeToPage(
  this: BlocksStoreState & {
    blocksById: Record<string, Block>;
    childrenByParentId: Record<string, Record<string, string[]>>;
    collectSubtreeIds: (
      pageId: string | number,
      rootId: string | number,
    ) => string[];
    rebuildPageIndex: (pageId: string | number) => void;
    fetchBlocksForPage: (pageId: string | number) => Promise<void>;
  },
  {
    fromPageId,
    toPageId,
    rootId,
    toParentId = null,
    afterBlockId = null,
  }: {
    fromPageId: string | number;
    toPageId: string | number;
    rootId: string | number;
    toParentId?: string | number | null;
    afterBlockId?: string | number | null;
  },
): Promise<void> {
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

  const fromPageIdStr = String(fromPageId);
  const toPageIdStr = String(toPageId);
  const rootIdStr = String(rootId);

  console.log(
    "fromPageId",
    fromPageIdStr,
    "toPageId",
    toPageIdStr,
    "rootId",
    rootIdStr,
    "toParentId",
    toParentId,
    "afterBlockId",
    afterBlockId,
  );

  const subtreeIds = this.collectSubtreeIds(fromPageIdStr, rootIdStr);
  const subtreeSet = new Set(subtreeIds.map(String));
  const root = this.blocksById[rootIdStr];
  const parentNorm = normalizeParentForApi(toParentId);
  const afterNorm = normalizeAfterForApi(afterBlockId);

  if (root) {
    const pageMap = this.childrenByParentId[toPageIdStr] ?? {};
    const key = parentKeyOf(parentNorm);
    const siblings = (pageMap[key] ?? [])
      .map(String)
      .filter((id) => !subtreeSet.has(id) && id !== rootIdStr);

    let prevPos: string | null = null;
    let nextPos: string | null = null;

    if (afterNorm != null) {
      const afterIdStr = String(afterNorm);
      const idx = siblings.indexOf(afterIdStr);
      prevPos = this.blocksById[afterIdStr]?.position ?? null;
      const nextId = idx >= 0 ? (siblings[idx + 1] ?? null) : null;
      nextPos = nextId
        ? (this.blocksById[String(nextId)]?.position ?? null)
        : null;
    } else {
      const lastId = siblings.length ? siblings[siblings.length - 1] : null;
      prevPos = lastId
        ? (this.blocksById[String(lastId)]?.position ?? null)
        : null;
      nextPos = null;
    }

    const newRootPos = posBetween(prevPos, nextPos);

    for (const id of subtreeIds) {
      const b = this.blocksById[String(id)];
      if (!b) continue;
      b.pageId = toPageIdStr;
      if (String(id) === rootIdStr) {
        b.parentId = parentNorm;
        b.position = newRootPos;
      }
    }

    this.rebuildPageIndex(fromPageIdStr);
    if (toPageIdStr !== fromPageIdStr) this.rebuildPageIndex(toPageIdStr);
  }

  try {
    const res = await api.post(`/pages/${fromPageIdStr}/transfer-subtree/`, {
      root_id: rootIdStr,
      to_page_id: toPageIdStr,
      to_parent_block: parentNorm,
      after_block_id: afterNorm,
    });

    const blocks = (res.data?.blocks ?? []) as RawBlock[];
    const normBlocks = blocks.map((b) => normalizeBlock(b));
    for (const b of normBlocks) {
      this.blocksById[b.id] = b;
    }

    this.rebuildPageIndex(fromPageIdStr);
    if (toPageIdStr !== fromPageIdStr) this.rebuildPageIndex(toPageIdStr);
  } catch (e) {
    // safe resync on error
    await this.fetchBlocksForPage(fromPageIdStr);
    if (toPageIdStr !== fromPageIdStr)
      await this.fetchBlocksForPage(toPageIdStr);
    throw e;
  }
}

export async function duplicateBlockInPlace(
  this: BlocksStoreState & {
    blocksById: Record<string, Block>;
    childrenByParentId: Record<string, Record<string, string[]>>;
    collectSubtreeIds: (
      pageId: string | number,
      rootId: string | number,
    ) => string[];
    makeTempId: (prefix?: string) => string;
    applyCreateLocal: (pageId: string | number, rawNode: any) => boolean;
    removeBlocksLocal: (blockIds: (string | number)[]) => void;
    rebuildPageIndex: (pageId: string | number) => void;
    fetchBlocksForPage: (pageId: string | number) => Promise<void>;
  },
  pageId: string | number,
  blockId: string | number,
): Promise<void> {
  const pageIdStr = String(pageId);
  const blockIdStr = String(blockId);

  const root = this.blocksById[blockIdStr];
  if (!root) return;

  const subtreeIds = this.collectSubtreeIds(pageIdStr, blockIdStr);
  const tempIdMap = new Map<string, string>();
  for (const id of subtreeIds) {
    tempIdMap.set(String(id), this.makeTempId("dup"));
  }

  const parentKey = parentKeyOf(root.parentId);
  const siblings = (this.childrenByParentId[pageIdStr]?.[parentKey] ?? []).map(
    String,
  );
  const idx = siblings.indexOf(blockIdStr);
  const nextId = idx >= 0 ? (siblings[idx + 1] ?? null) : null;
  const nextPos = nextId
    ? (this.blocksById[String(nextId)]?.position ?? null)
    : null;
  const newRootPos = posBetween(root.position ?? null, nextPos);

  for (const oldId of subtreeIds) {
    const oldBlock = this.blocksById[String(oldId)];
    if (!oldBlock) continue;
    const newId = tempIdMap.get(String(oldId)) as string;
    const newParentId =
      String(oldId) === blockIdStr
        ? oldBlock.parentId
        : (tempIdMap.get(String(oldBlock.parentId ?? "")) ?? null);

    const cloned = {
      id: newId,
      pageId: pageIdStr,
      parentId: newParentId,
      kind: oldBlock.kind,
      type: oldBlock.type,
      content: JSON.parse(JSON.stringify(oldBlock.content ?? {})),
      props: JSON.parse(JSON.stringify(oldBlock.props ?? {})),
      layout: JSON.parse(JSON.stringify(oldBlock.layout ?? {})),
      width: oldBlock.width ?? null,
      position: String(oldId) === blockIdStr ? newRootPos : oldBlock.position,
      version: 1,
      updatedAt: null,
    };

    this.applyCreateLocal(pageIdStr, cloned);
  }

  try {
    const res = await api.post(`/blocks/${blockIdStr}/duplicate-subtree/`, {});
    const blocks = (res.data?.blocks ?? []) as RawBlock[];
    const normBlocks = blocks.map((b) => normalizeBlock(b));

    if (normBlocks.length) {
      this.removeBlocksLocal(Array.from(tempIdMap.values()));
      for (const b of normBlocks) {
        this.blocksById[b.id] = b;
      }
      this.rebuildPageIndex(pageIdStr);
    }
  } catch (e) {
    console.warn("Error duplicating block:", (e as any)?.response?.data ?? e);
    await this.fetchBlocksForPage(pageIdStr);
    throw e;
  }
}
