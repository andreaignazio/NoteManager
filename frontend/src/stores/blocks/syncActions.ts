// API synchronization and fetching actions
import api from "@/services/api";
import { DEFAULT_BLOCK_TYPE } from "@/domain/blockTypes";
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

    const blocks = (response.data.blocks ?? []) as RawBlock[];
    const normBlocks = blocks.map((b) => normalizeBlock(b));

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
  const pageIdStr = String(pageId);
  try {
    for (const op of tx.ops ?? []) {
      if (op.op === "create") {
        const n = op.node;
        const payload = {
          id: n.id,
          kind: n.kind ?? "block",
          parent_block: n.parentId ?? null,
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
          parent_block: op.parentId ?? null,
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
  ): string | null =>
    pid === "root" || pid === undefined ? null : String(pid);

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

  try {
    await api.post(`/pages/${fromPageIdStr}/transfer-subtree/`, {
      root_id: rootIdStr,
      to_page_id: toPageIdStr,
      to_parent_block: toParentId,
      after_block_id: afterBlockId,
    });

    // hard resync
    await this.fetchBlocksForPage(fromPageIdStr);
    await this.fetchBlocksForPage(toPageIdStr);
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
    fetchBlocksForPage: (pageId: string | number) => Promise<void>;
  },
  pageId: string | number,
  blockId: string | number,
): Promise<void> {
  const pageIdStr = String(pageId);
  const blockIdStr = String(blockId);
  try {
    await api.post(`/blocks/${blockIdStr}/duplicate-subtree/`, {});
    await this.fetchBlocksForPage(pageIdStr);
  } catch (e) {
    console.warn("Error duplicating block:", (e as any)?.response?.data ?? e);
    await this.fetchBlocksForPage(pageIdStr);
    throw e;
  }
}
