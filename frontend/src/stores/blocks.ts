import { defineStore } from "pinia";

// Import types
import type {
  Block,
  BlockContent,
  BlockStyle,
  BlockProps,
  FlattenedBlock,
  RenderRow,
  Transaction,
  BatchBlockItem,
  BatchAddResponse,
  BlocksStoreState,
} from "./blocks/types";

// Import action modules
import * as hierarchyActions from "./blocks/hierarchyActions";
import * as contentActions from "./blocks/contentActions";
import * as syncActions from "./blocks/syncActions";
import * as crudActions from "./blocks/crudActions";
import * as utilityActions from "./blocks/utilityActions";

// ===========================
// HELPER FUNCTIONS
// ===========================

const KEY_ROOT = "root";
const parentKeyOf = (parentId: string | null): string =>
  parentId == null ? KEY_ROOT : String(parentId);

// ===========================
// STORE DEFINITION
// ===========================

export const useBlocksStore = defineStore("blocksStore", {
  state: (): BlocksStoreState => ({
    // data
    blocksById: {},
    blocksByPage: {},
    childrenByParentId: {},
    expandedById: {},

    // selection
    currentBlockId: null,
    focusRequestId: null,

    _contentTokens: {},

    // options menu
    optionsMenu: {
      open: false,
      blockId: null,
      anchorRect: null,
    },

    // anti-race fetch
    _fetchTokenByPage: {},
  }),

  getters: {
    currentBlock(state): Block | null {
      return state.currentBlockId
        ? state.blocksById[state.currentBlockId]
        : null;
    },

    blocksForPage:
      (state) =>
      (pageId: string | number): Block[] => {
        const pageIdStr = String(pageId);
        return (state.blocksByPage[pageIdStr] ?? [])
          .map((blockId) => state.blocksById[blockId])
          .filter(Boolean);
      },

    flattenForPage:
      (state) =>
      (pageId: string | number): FlattenedBlock[] => {
        const pageIdStr = String(pageId);
        const pageMap = state.childrenByParentId[pageIdStr] ?? {};
        const out: FlattenedBlock[] = [];

        const visit = (parentKey: string, level: number): void => {
          const childIds = pageMap[parentKey] ?? [];
          for (const id of childIds) {
            const block = state.blocksById[id];
            if (!block) continue;
            out.push({ id, level });
            visit(String(id), level + 1);
          }
        };

        visit(KEY_ROOT, 0);
        return out;
      },

    renderRowsForPage:
      (state) =>
      (pageId: string | number): RenderRow[] => {
        const pageIdStr = String(pageId);
        const pageMap = state.childrenByParentId[pageIdStr] ?? {};
        const out: FlattenedBlock[] = [];

        const visit = (parentKey: string, level: number): void => {
          const childIds = pageMap[parentKey] ?? [];
          for (const id of childIds) {
            const block = state.blocksById[id];
            if (!block) continue;
            out.push({ id, level });
            visit(String(id), level + 1);
          }
        };

        visit(KEY_ROOT, 0);

        return (out ?? [])
          .map(({ id, level }) => {
            const block = state.blocksById[id];
            return block ? { block, level } : null;
          })
          .filter((item): item is RenderRow => item !== null);
      },

    getOlNumber:
      (state) =>
      (pageId: string | number, blockId: string | number): number | null => {
        const pageIdStr = String(pageId);
        const blockIdStr = String(blockId);

        const b = state.blocksById[blockIdStr];
        if (!b) return null;
        if (b.type !== "ol") return null;

        const pageMap = state.childrenByParentId[pageIdStr] ?? {};
        const key = parentKeyOf(b.parentId);

        const sibIds = (pageMap[key] ?? []).map(String);
        const idx = sibIds.indexOf(blockIdStr);
        if (idx < 0) return 1;

        // find start of contiguous ol run
        let start = idx;
        while (start - 1 >= 0) {
          const prevId = sibIds[start - 1];
          const prev = state.blocksById[prevId];
          if (!prev) break;
          if (prev.kind !== "block") break;
          if (prev.type !== "ol") break;
          start--;
        }

        // count ol blocks from start to idx
        let n = 0;
        for (let i = start; i <= idx; i++) {
          const it = state.blocksById[sibIds[i]];
          if (!it || it.kind !== "block" || it.type !== "ol") break;
          n++;
        }
        return n;
      },
  },

  actions: {
    // ===========================
    // HIERARCHY ACTIONS
    // ===========================
    ensurePageMap: hierarchyActions.ensurePageMap,
    getKind: hierarchyActions.getKind,
    hasRowAncestor: hierarchyActions.hasRowAncestor,
    sortSiblingsByPosition: hierarchyActions.sortSiblingsByPosition,
    applyMoveLocal: hierarchyActions.applyMoveLocal,
    applyDeleteLocal: hierarchyActions.applyDeleteLocal,
    getParentKeyOf: hierarchyActions.getParentKeyOf,
    indentBlock: hierarchyActions.indentBlock,
    outdentBlock: hierarchyActions.outdentBlock,
    isCircularMove: hierarchyActions.isCircularMove,

    // ===========================
    // CONTENT ACTIONS
    // ===========================
    updateBlockContent: contentActions.updateBlockContent,
    buildNextProps: contentActions.buildNextProps,
    updateBlockType: contentActions.updateBlockType,
    updateBlockStyle: contentActions.updateBlockStyle,
    updateBlockIcon: contentActions.updateBlockIcon,
    patchBlockOptimistic: contentActions.patchBlockOptimistic,
    patchBlockLocal: contentActions.patchBlockLocal,

    // ===========================
    // SYNC ACTIONS
    // ===========================
    fetchBlocksForPage: syncActions.fetchBlocksForPage,
    patchBlock: syncActions.patchBlock,
    persistTransaction: syncActions.persistTransaction,
    moveBlock: syncActions.moveBlock,
    deleteBlock: syncActions.deleteBlock,
    transferSubtreeToPage: syncActions.transferSubtreeToPage,
    duplicateBlockInPlace: syncActions.duplicateBlockInPlace,

    // ===========================
    // CRUD ACTIONS
    // ===========================
    addNewBlock: crudActions.addNewBlock,
    addNewBlockAfter: crudActions.addNewBlockAfter,
    addNewBlockAfterAdoptChildren: crudActions.addNewBlockAfterAdoptChildren,
    mapBatchItem: crudActions.mapBatchItem,
    batchAddBlocksAfter: crudActions.batchAddBlocksAfter,

    // ===========================
    // UTILITY ACTIONS
    // ===========================
    applyCreateLocal: utilityActions.applyCreateLocal,
    applyUpdateLocal: utilityActions.applyUpdateLocal,
    applyTransactionLocal: utilityActions.applyTransactionLocal,
    setCurrentBlock: utilityActions.setCurrentBlock,
    clearCurrentBlock: utilityActions.clearCurrentBlock,
    requestFocus: utilityActions.requestFocus,
    clearFocusRequest: utilityActions.clearFocusRequest,
    closeOptionsMenu: utilityActions.closeOptionsMenu,
    isExpanded: utilityActions.isExpanded,
    expandBlock: utilityActions.expandBlock,
    toggleExpandBlock: utilityActions.toggleExpandBlock,
    collapseAll: utilityActions.collapseAll,
  },
});

export default useBlocksStore;
