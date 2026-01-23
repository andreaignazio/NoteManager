import { defineStore } from "pinia";
import api from "@/services/api";
import { DEFAULT_BLOCK_TYPE } from "@/domain/blockTypes";
import { posBetween } from "@/domain/position";
import { normalizeProps, isTextToken, isBgToken } from "@/theme/colorsCatalog";
import { DEFAULT_ICON_ID } from "@/icons/catalog";

/*function normalizeProps(rawProps) {
  const p = rawProps && typeof rawProps === 'object' ? rawProps : {}
  const style = p.style && typeof p.style === 'object' ? p.style : {}
  return {
    ...p,
    style: {
      ...DEFAULT_STYLE,
      ...style,
    },
  }
}*/

function normalizeBlock(raw) {
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

const KEY_ROOT = "root";
const parentKeyOf = (parentId) =>
  parentId == null ? KEY_ROOT : String(parentId);
const normalizeParentForApi = (pid) =>
  pid === "root" || pid === undefined ? null : pid;

export const useBlocksStore = defineStore("blocksStore", {
  state: () => ({
    // data
    blocksById: {},
    blocksByPage: {},
    childrenByParentId: {},
    expandedById: {},

    // selection
    currentBlockId: null,
    focusRequestId: null,

    _contentTokens: {},

    //Editors
    editorsByBlockId: {},

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
    currentBlock(state) {
      return state.currentBlockId
        ? state.blocksById[state.currentBlockId]
        : null;
    },

    blocksForPage: (state) => (pageId) => {
      return (state.blocksByPage[pageId] ?? [])
        .map((blockId) => state.blocksById[blockId])
        .filter(Boolean);
    },

    flattenForPage: (state) => (pageId) => {
      const pageMap = state.childrenByParentId[pageId] ?? {};
      const out = [];

      const visit = (parentKey, level) => {
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

    renderRowsForPage: (state) => (pageId) => {
      const pageMap = state.childrenByParentId[pageId] ?? {};
      const out = [];

      const visit = (parentKey, level) => {
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
        .filter(Boolean);
    },
    getOlNumber: (state) => (pageId, blockId) => {
      pageId = String(pageId);
      blockId = String(blockId);

      const b = state.blocksById[blockId];
      if (!b) return null;
      if (b.type !== "ol") return null;

      const pageMap = state.childrenByParentId[pageId] ?? {};
      const key = parentKeyOf(b.parentId); // 'root' se null

      const sibIds = (pageMap[key] ?? []).map(String);
      const idx = sibIds.indexOf(blockId);
      if (idx < 0) return 1;

      // trova inizio della "run" contigua di ol
      let start = idx;
      while (start - 1 >= 0) {
        const prevId = sibIds[start - 1];
        const prev = state.blocksById[prevId];
        if (!prev) break;
        if (prev.kind !== "block") break;
        if (prev.type !== "ol") break;
        start--;
      }

      // conta quanti ol ci sono da start a idx (si ferma se incontra non-ol)
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
    // -----------------------------
    // Editors management
    // -----------------------------

    registerEditor(blockId, editorRef) {
      this.editorsByBlockId[String(blockId)] = editorRef;
    },
    unregisterEditor(blockId) {
      delete this.editorsByBlockId[String(blockId)];
    },
    getCurrentEditor() {
      const id = this.currentBlockId;
      if (!id) return null;
      const editorRef = this.editorsByBlockId[String(id)];
      return editorRef?.value ?? null;
    },

    // -----------------------------
    // Helpers (internal)
    // -----------------------------

    ensurePageMap(pageId) {
      if (!this.childrenByParentId[pageId])
        this.childrenByParentId[pageId] = {};
    },
    getKind(id) {
      const n = this.blocksById[String(id)];
      return n?.kind ?? "block";
    },
    hasRowAncestor(blockId) {
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
    },

    sortSiblingsByPosition(ids) {
      ids.sort((a, b) => {
        a = String(a);
        b = String(b);
        const pa = this.blocksById[a]?.position ?? "\uffff";
        const pb = this.blocksById[b]?.position ?? "\uffff";
        return pa < pb ? -1 : pa > pb ? 1 : a.localeCompare(b);
      });
    },

    applyMoveLocal(pageId, blockId, { newParentId, newPosition }) {
      blockId = String(blockId);
      const block = this.blocksById[blockId];
      if (!block) return false;

      this.ensurePageMap(pageId);

      const oldKey = parentKeyOf(block.parentId);
      const newKey = parentKeyOf(newParentId);

      // update metadata
      block.parentId = newParentId;
      block.position = newPosition;

      // remove from old list
      const oldList = (this.childrenByParentId[pageId][oldKey] ?? [])
        .map(String)
        .filter((id) => id !== blockId);
      this.childrenByParentId[pageId][oldKey] = oldList;

      // insert into new list (avoid dup)
      const baseNew =
        oldKey === newKey
          ? oldList
          : (this.childrenByParentId[pageId][newKey] ?? []).map(String);

      const nextNew = baseNew.filter((id) => id !== blockId);
      nextNew.push(blockId);
      this.childrenByParentId[pageId][newKey] = nextNew;

      this.sortSiblingsByPosition(this.childrenByParentId[pageId][newKey]);
      return true;
    },

    /*applyDeleteLocal(pageId, blockId) {
      blockId = String(blockId)
      const block = this.blocksById[blockId]
      if (!block) return false

      this.ensurePageMap(pageId)

      const parentKey = parentKeyOf(block.parentId)
      const arr = (this.childrenByParentId[pageId][parentKey] ?? []).map(String)
      this.childrenByParentId[pageId][parentKey] = arr.filter((id) => id !== blockId)

      delete this.blocksById[blockId]

      if (this.currentBlockId === blockId) this.currentBlockId = null
      if (this.optionsMenu?.blockId === blockId) this.closeOptionsMenu()

      return true
    },*/
    applyDeleteLocal(pageId, blockId) {
      blockId = String(blockId);
      const block = this.blocksById[blockId];
      if (!block) return false;

      this.ensurePageMap(pageId);

      const parentKey = parentKeyOf(block.parentId);
      const siblings = (this.childrenByParentId[pageId][parentKey] ?? []).map(
        String,
      );

      // figli diretti del blocco che stai eliminando
      const selfKey = parentKeyOf(blockId);
      const children = (this.childrenByParentId[pageId][selfKey] ?? []).map(
        String,
      );

      // rimpiazza il blocco con i suoi figli, mantenendo la posizione
      const idx = siblings.indexOf(blockId);
      const nextSiblings =
        idx === -1
          ? siblings.filter((id) => id !== blockId) // fallback
          : [
              ...siblings.slice(0, idx),
              ...children,
              ...siblings.slice(idx + 1),
            ];

      this.childrenByParentId[pageId][parentKey] = nextSiblings;

      // re-parent dei figli
      for (const childId of children) {
        const child = this.blocksById[String(childId)];
        if (child) child.parentId = block.parentId;
      }

      // pulisci la lista figli del blocco eliminato
      delete this.childrenByParentId[pageId][selfKey];

      // elimina solo il blocco
      delete this.blocksById[blockId];

      if (this.currentBlockId === blockId) this.currentBlockId = null;
      if (this.optionsMenu?.blockId === blockId) this.closeOptionsMenu();

      return true;
    },

    getParentKeyOf(parentId) {
      return parentKeyOf(parentId);
    },

    applyCreateLocal(pageId, rawNode) {
      const node = {
        id: String(rawNode.id),
        pageId: String(rawNode.pageId ?? pageId),
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

      // blocksByPage
      if (!this.blocksByPage[pageId]) this.blocksByPage[pageId] = [];
      if (!this.blocksByPage[pageId].includes(node.id))
        this.blocksByPage[pageId].push(node.id);

      // children map
      this.ensurePageMap(pageId);
      const key = parentKeyOf(node.parentId);
      const arr = (this.childrenByParentId[pageId][key] ?? []).map(String);
      if (!arr.includes(node.id)) arr.push(node.id);
      this.childrenByParentId[pageId][key] = arr;
      this.sortSiblingsByPosition(this.childrenByParentId[pageId][key]);

      return true;
    },

    applyUpdateLocal(blockId, patch) {
      blockId = String(blockId);
      const b = this.blocksById[blockId];
      if (!b) return false;

      // non permettere di cambiare id/pageId qui
      const next = { ...b, ...patch };
      next.id = b.id;
      next.pageId = b.pageId;

      // se cambiano parent/position usa move (regola: update non fa move)
      if ("parentId" in patch || "position" in patch) {
        console.warn("applyUpdateLocal: parentId/position should use move op");
      }

      this.blocksById[blockId] = next;
      return true;
    },

    applyTransactionLocal(pageId, tx) {
      if (!tx?.ops?.length) return false;
      pageId = String(pageId);

      for (const op of tx.ops) {
        if (!op) continue;

        if (op.op === "create") {
          this.applyCreateLocal(pageId, op.node);
          continue;
        }

        if (op.op === "move") {
          const parentId = op.parentId == null ? null : String(op.parentId);
          this.applyMoveLocal(pageId, op.id, {
            newParentId: parentId,
            newPosition: String(op.position),
          });
          continue;
        }

        if (op.op === "update") {
          this.applyUpdateLocal(op.id, op.patch ?? {});
          continue;
        }

        if (op.op === "delete") {
          this.applyDeleteLocal(pageId, op.id);
          continue;
        }

        console.warn("Unknown tx op", op);
      }

      return true;
    },

    // -----------------------------
    // Selection / focus / menu
    // -----------------------------
    setCurrentBlock(blockId) {
      this.currentBlockId = String(blockId);
    },

    clearCurrentBlock() {
      this.currentBlockId = null;
    },

    requestFocus(blockId, caret = 0) {
      this.focusRequestId = { blockId: String(blockId), caret };
    },

    clearFocusRequest() {
      this.focusRequestId = null;
    },

    openOptionsMenu(blockId, anchorRect) {
      this.optionsMenu = { open: true, blockId: String(blockId), anchorRect };
    },

    closeOptionsMenu() {
      this.optionsMenu = { open: false, blockId: null, anchorRect: null };
    },

    setOptionsMenuAnchor(anchorEl) {
      // (non usata nel flow attuale, ma la lascio)
      this.optionsMenu.anchorEl = anchorEl;
    },
    isExpanded(blockId) {
      const block = this.blocksById[blockId];
      const v = block?.content?.isExpanded;
      return v ?? true; // default true se null/undefined
    },

    expandBlock(blockId) {
      blockId = String(blockId);
      const block = this.blocksById[blockId];
      if (!block) return;
      if (!block.content) block.content = {};
      block.content.isExpanded = true;
      this.updateBlockContent(blockId, { isExpanded: true });
    },

    toggleExpandBlock(blockId) {
      blockId = String(blockId);
      const block = this.blocksById[blockId];
      if (!block) return;

      const next = !(block.content?.isExpanded ?? true); // default true
      if (!block.content) block.content = {};
      block.content.isExpanded = next;

      // optimistic + sync
      this.updateBlockContent(blockId, { isExpanded: next });
    },

    collapseAll() {
      this.expandedById = {};
    },

    // -----------------------------
    // Fetch (replace totale) + anti-race token
    // -----------------------------
    async fetchBlocksForPage(pageId) {
      const token = (this._fetchTokenByPage[pageId] ?? 0) + 1;
      this._fetchTokenByPage[pageId] = token;

      try {
        const response = await api.get(`/pages/${pageId}/`);
        if (this._fetchTokenByPage[pageId] !== token) return;

        const blocks = response.data.blocks ?? [];
        const normBlocks = blocks.map((b) => normalizeBlock(b));
        // --- MERGE PER-PAGE (non distruggere blocksById globale) ---

        // 1) ricorda gli id che avevi prima per questa pagina
        const prevIds = (this.blocksByPage[String(pageId)] ?? []).map(String);

        // 2) scrivi/aggiorna i blocchi fetchati
        for (const b of normBlocks) {
          this.blocksById[b.id] = b;
        }

        // 3) aggiorna la lista ids per la pagina
        const nextIds = normBlocks.map((b) => b.id);
        this.blocksByPage[String(pageId)] = nextIds;

        // 4) rimuovi i blocchi che prima erano in questa pagina ma ora non ci sono più
        //    (es: perché spostati altrove o cancellati)
        const nextIdSet = new Set(nextIds);
        for (const id of prevIds) {
          if (nextIdSet.has(id)) continue;
          const old = this.blocksById[id];
          // elimina solo se è ancora marcato come appartenente a questa pagina (stale)
          if (old?.pageId === String(pageId)) {
            delete this.blocksById[id];
          }
        }

        // 5) rebuild children map SOLO per questa pagina (ok come già fai)
        const pageMap = normBlocks.reduce((dict, b) => {
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

        this.childrenByParentId[String(pageId)] = pageMap;
      } catch (error) {
        console.error("Errore caricamento pagina:", error);
        throw error;
      }

      const anyBlockForPage = (this.blocksByPage[pageId]?.length ?? 0) > 0;

      // Se la pagina è vuota, crea il primo blocco (con type valido!)
      if (!anyBlockForPage) {
        await this.addNewBlock(
          pageId,
          { type: DEFAULT_BLOCK_TYPE, content: { text: "" } },
          null,
        );
        // non serve refetch: addNewBlock oggi fa fetch internamente
        return;
      }
    },

    // -----------------------------
    // Persist helpers
    // -----------------------------
    async patchBlock(blockId, payload) {
      try {
        const res = await api.patch(`/blocks/${blockId}/`, payload);
        return res.data;
      } catch (error) {
        console.warn("Error patching block:", error?.response?.data ?? error);
        throw error;
      }
    },
    async persistTransaction(pageId, tx) {
      pageId = String(pageId);
      try {
        for (const op of tx.ops ?? []) {
          if (op.op === "create") {
            // backend: POST /pages/:id/blocks/ (nested action)
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
            await api.post(`/pages/${pageId}/blocks/`, payload);
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
        // resync hard
        await this.fetchBlocksForPage(pageId);
        throw e;
      }
    },

    // -----------------------------
    // UI-Optimistic Actions (Phase A)
    // -----------------------------

    // Dragdrop move: optimistic immediately, fetch hard only on error
    async moveBlock(pageId, blockId, { parentId, position }) {
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
        // ✅ no fetch on success
      } catch (e) {
        // fetch hard on error (safe)
        await this.fetchBlocksForPage(pageId);
        throw e;
      }
    },

    // Tab indent: optimistic local, fetch hard on error
    async indentBlock(pageId, blockId) {
      if (this.hasRowAncestor(blockId)) return;
      blockId = String(blockId);
      const block = this.blocksById[blockId];
      if (!block) return;

      this.ensurePageMap(pageId);

      const oldKey = parentKeyOf(block.parentId);
      const siblings = (this.childrenByParentId[pageId][oldKey] ?? []).map(
        String,
      );
      const idx = siblings.indexOf(blockId);
      if (idx <= 0) return;

      const newParentId = siblings[idx - 1];
      const prev = this.blocksById[String(newParentId)];
      if (!prev || (prev.kind ?? "block") !== "block") return;
      if (this.hasRowAncestor(newParentId)) return;

      const newKey = parentKeyOf(newParentId);
      const newSiblings = (this.childrenByParentId[pageId][newKey] ?? []).map(
        String,
      );

      const lastId = newSiblings.at(-1) ?? null;
      const lastPos = lastId
        ? (this.blocksById[String(lastId)]?.position ?? null)
        : null;
      const newPos = posBetween(lastPos, null);

      this.applyMoveLocal(pageId, blockId, {
        newParentId,
        newPosition: newPos,
      });

      try {
        await this.patchBlock(blockId, {
          parent_block: newParentId,
          position: newPos,
        });
        // ✅ no fetch on success
      } catch (e) {
        await this.fetchBlocksForPage(pageId);
        throw e;
      }
    },

    async outdentBlock(pageId, blockId) {
      if (this.hasRowAncestor(blockId)) return;
      blockId = String(blockId);
      const block = this.blocksById[blockId];
      if (!block?.parentId) return;

      this.ensurePageMap(pageId);

      const oldParentId = String(block.parentId);
      const oldParent = this.blocksById[oldParentId];
      if (!oldParent) return;

      const newParentId = oldParent.parentId ?? null;
      const oldKey = parentKeyOf(oldParentId);
      const newKey = parentKeyOf(newParentId);

      const siblings = (this.childrenByParentId[pageId][oldKey] ?? []).map(
        String,
      );
      const idx = siblings.indexOf(blockId);
      if (idx === -1) return;

      const adoptedChildren = siblings.slice(idx + 1);

      const parentSiblings = (
        this.childrenByParentId[pageId][newKey] ?? []
      ).map(String);
      const parentIdx = parentSiblings.indexOf(oldParentId);

      const prevPos = oldParent.position ?? null;
      const nextId =
        parentIdx >= 0 ? (parentSiblings[parentIdx + 1] ?? null) : null;
      const nextPos = nextId
        ? (this.blocksById[String(nextId)]?.position ?? null)
        : null;
      const newPos = posBetween(prevPos, nextPos);

      // ---------- OPTIMISTIC LOCAL ----------

      // 1) sposta il blocco (rimuove da oldKey e inserisce in newKey)
      this.applyMoveLocal(pageId, blockId, {
        newParentId,
        newPosition: newPos,
      });
      this.childrenByParentId[pageId][oldKey] = siblings.slice(0, idx);

      const blockKey = parentKeyOf(blockId);
      const existingChildren = (
        this.childrenByParentId[pageId][blockKey] ?? []
      ).map(String);
      const nextChildren = existingChildren.concat(adoptedChildren);
      this.childrenByParentId[pageId][blockKey] = nextChildren;

      for (const cid of adoptedChildren) {
        const child = this.blocksById[cid];
        if (child) child.parentId = blockId;
      }

      // ---------- PERSIST ----------

      try {
        // patch del blocco outdented
        await this.patchBlock(blockId, {
          parent_block: newParentId,
          position: newPos,
        });

        // patch dei figli adottati
        for (const cid of adoptedChildren) {
          await this.patchBlock(cid, { parent_block: blockId });
        }
      } catch (e) {
        await this.fetchBlocksForPage(pageId); // hard resync
        throw e;
      }
    },

    // Delete: optimistic local remove, fetch hard only on error
    async deleteBlock(blockId, pageId) {
      blockId = String(blockId);

      // optimistic local
      this.applyDeleteLocal(pageId, blockId);

      try {
        await api.delete(`/blocks/${blockId}/`);
        // ✅ no fetch on success
      } catch (error) {
        console.warn("Error deleting block:", error?.response?.data ?? error);
        await this.fetchBlocksForPage(pageId); // hard resync
        throw error;
      }
    },

    // -----------------------------
    // Content / type
    // -----------------------------

    async updateBlockContent(blockId, patch) {
      blockId = String(blockId);
      const editedBlock = this.blocksById[blockId];
      if (!editedBlock) return;

      if (!this._contentTokens) this._contentTokens = {};

      const token = (this._contentTokens[blockId] =
        (this._contentTokens[blockId] ?? 0) + 1);

      // clona "safe" (evita side-effects se content è referenziato altrove)
      const previousContent = JSON.parse(
        JSON.stringify(editedBlock.content ?? {}),
      );
      const nextContent = { ...previousContent, ...(patch ?? {}) };

      // optimistic
      editedBlock.content = nextContent;

      try {
        await api.patch(`/blocks/${blockId}/`, { content: nextContent });

        if (this._contentTokens[blockId] !== token) return;
      } catch (error) {
        if (this._contentTokens[blockId] === token) {
          editedBlock.content = previousContent;
        }
        console.warn("Error updating block:", error?.response?.data ?? error);
        throw error;
      }
    },

    buildNextProps(existingProps, stylePatch) {
      const base = normalizeProps(existingProps);
      const prevStyle = base.style ?? {};
      const next = {
        ...base,
        style: {
          ...prevStyle,
          ...stylePatch,
        },
      };
      return normalizeProps(next);
    },

    async updateBlockType(blockId, newType) {
      blockId = String(blockId);
      const b = this.blocksById[blockId];
      if (!b) return;

      const previousType = b.type;
      const previousProps = b.props;

      const previousContent = b.content;

      // calcola nextProps con la regola richiesta
      let nextProps = previousProps;
      let nextContent = previousContent;

      const prevStyle = normalizeProps(previousProps).style;

      const prevBg = prevStyle?.bgColor ?? "default";

      // ✅ Regola: se entro in code e bg è ancora default -> set gray_bg
      if (newType === "code" && prevBg === "default") {
        nextProps = this.buildNextProps(previousProps, { bgColor: "gray_bg" });
      }
      if (
        previousType === "code" &&
        newType !== "code" &&
        prevBg === "gray_bg"
      ) {
        nextProps = this.buildNextProps(previousProps, { bgColor: "default" });
      }

      if (newType === "callout" && prevBg === "default") {
        nextProps = this.buildNextProps(previousProps, {
          bgColor: "darkgray_bg",
        });
      }
      if (
        previousType === "callout" &&
        newType !== "callout" &&
        prevBg === "darkgray_bg"
      ) {
        nextProps = this.buildNextProps(previousProps, { bgColor: "default" });
      }
      if (newType === "callout" && !b.props?.iconId) {
        nextProps.iconId = DEFAULT_ICON_ID;
      }
      if (newType === "toggle") {
        nextContent = { ...(previousContent ?? {}), isExpanded: true };
      }

      // optimistic
      b.type = newType;
      if (nextProps !== previousProps) b.props = nextProps;
      if (nextContent !== previousContent) b.content = nextContent;

      try {
        // 🔥 1 PATCH sola (meglio): type + props insieme
        const payload = { type: newType };
        if (nextProps !== previousProps) payload.props = nextProps;
        if (nextContent !== previousContent) {
          payload.content = nextContent;
        }
        await api.patch(`/blocks/${blockId}/`, payload);
      } catch (error) {
        console.warn(
          "Error updating block type:",
          error?.response?.data ?? error,
        );
        b.type = previousType;
        b.props = previousProps;
        throw error;
      }
    },

    async updateBlockStyle(blockId, stylePatch) {
      blockId = String(blockId);
      const b = this.blocksById[blockId];
      if (!b) return;

      const prevProps = normalizeProps(b.props);
      const prevStyle = prevProps.style;
      const nextStyle = { ...prevStyle };

      if ("textColor" in stylePatch && isTextToken(stylePatch.textColor)) {
        nextStyle.textColor = stylePatch.textColor;
      }
      if ("bgColor" in stylePatch && isBgToken(stylePatch.bgColor)) {
        nextStyle.bgColor = stylePatch.bgColor;
      }

      const nextProps = { ...prevProps, style: nextStyle };

      b.props = nextProps;
      try {
        const res = await api.patch(`/blocks/${blockId}/`, {
          props: nextProps,
        });
        console.log("PATCH", res);
      } catch (e) {
        b.props = prevProps;
        throw e;
      }
    },
    async updateBlockIcon(blockId, iconId) {
      const b = this.blocksById[blockId];
      if (!b) return;

      const prevProps = b.props ?? {};
      const nextProps = {
        ...prevProps,
        iconId: iconId ?? null,
      };

      b.props = nextProps;

      try {
        await api.patch(`/blocks/${blockId}/`, { props: nextProps });
      } catch (e) {
        b.props = prevProps;
        throw e;
      }
    },

    // -----------------------------
    // Add new block
    // -----------------------------
    async addNewBlock(pageId, payload, blockId) {
      const key = String(blockId);
      const childIds = this.childrenByParentId[pageId]?.[key] ?? [];
      const hasChildren = childIds.length > 0;

      if (hasChildren)
        return await this.addNewBlockAfterAdoptChildren(
          pageId,
          payload,
          blockId,
        );
      return await this.addNewBlockAfter(pageId, payload, blockId);
    },

    async addNewBlockAfter(pageId, payload, blockId) {
      try {
        let postData = {};

        if (!blockId) {
          const parentKey = KEY_ROOT;
          const rootIds = this.childrenByParentId[pageId]?.[parentKey] ?? [];
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
          const anchor = this.blocksById[String(blockId)];
          if (!anchor) throw new Error("anchor block not found");

          const parentKey = parentKeyOf(anchor.parentId);
          const siblingsIds =
            this.childrenByParentId[pageId]?.[parentKey] ?? [];
          const idx = siblingsIds.map(String).indexOf(String(blockId));
          if (idx === -1)
            throw new Error(`blockId ${blockId} not found in siblings`);

          const prevPos = this.blocksById[String(blockId)]?.position ?? null;
          const nextId =
            idx + 1 < siblingsIds.length ? siblingsIds[idx + 1] : null;
          const nextPos = nextId
            ? (this.blocksById[String(nextId)]?.position ?? null)
            : null;
          const newPos = posBetween(prevPos, nextPos);

          postData = {
            type: payload.type ?? DEFAULT_BLOCK_TYPE,
            content: payload.content ?? { text: "" },
            parent_block: anchor.parentId, // null ok
            position: newPos,
          };
        }

        const res = await api.post(`/pages/${pageId}/blocks/`, postData);
        await this.fetchBlocksForPage(pageId);
        return String(res.data.id);
      } catch (error) {
        console.warn("Error adding new block:", error?.response?.data ?? error);
        throw error;
      }
    },

    /*async addNewBlockAfter(pageId, payload, blockId) {
      console.log("add_new_block_after")
  // --- helpers
  const makeTempId = () => `tmp_${Date.now()}_${Math.random().toString(16).slice(2)}`
  const asStr = (v) => String(v)

  const insertAfter = (arr, afterId, newId) => {
    const ids = arr ? [...arr] : []
    if (!afterId) {
      ids.push(newId)
      return ids
    }
    const idx = ids.map(String).indexOf(String(afterId))
    if (idx === -1) {
      // fallback: append (oppure throw)
      ids.push(newId)
      return ids
    }
    ids.splice(idx + 1, 0, newId)
    return ids
  }

  const removeId = (arr, id) => (arr ?? []).filter((x) => String(x) !== String(id))

  const replaceId = (arr, fromId, toId) =>
    (arr ?? []).map((x) => (String(x) === String(fromId) ? toId : x))

  // --- compute optimistic data (stesso calcolo posizioni che hai già)
  let postData = {}
  let parentKey = null
  let anchor = null
  let siblingsIds = []
  let insertAfterId = null

  if (!blockId) {
    const rootKey = KEY_ROOT
    parentKey = rootKey
    siblingsIds = this.childrenByParentId[pageId]?.[parentKey] ?? []

    const lastId = siblingsIds.length ? siblingsIds[siblingsIds.length - 1] : null
    const lastPos = lastId ? this.blocksById[asStr(lastId)]?.position ?? null : null
    const newPos = posBetween(lastPos, null)

    postData = {
      type: payload.type ?? DEFAULT_BLOCK_TYPE,
      content: payload.content ?? { text: '' },
      parent_block: null,
      position: newPos,
    }

    insertAfterId = lastId // "after last" = append
  } else {
    anchor = this.blocksById[asStr(blockId)]
    if (!anchor) throw new Error('anchor block not found')

    parentKey = parentKeyOf(anchor.parentId)
    siblingsIds = this.childrenByParentId[pageId]?.[parentKey] ?? []

    const idx = siblingsIds.map(String).indexOf(asStr(blockId))
    if (idx === -1) throw new Error(`blockId ${blockId} not found in siblings`)

    const prevPos = this.blocksById[asStr(blockId)]?.position ?? null
    const nextId = idx + 1 < siblingsIds.length ? siblingsIds[idx + 1] : null
    const nextPos = nextId ? this.blocksById[asStr(nextId)]?.position ?? null : null
    const newPos = posBetween(prevPos, nextPos)

    postData = {
      type: payload.type ?? DEFAULT_BLOCK_TYPE,
      content: payload.content ?? { text: '' },
      parent_block: anchor.parentId, // null ok
      position: newPos,
    }

    insertAfterId = blockId
  }

  // --- optimistic insert
  const tempId = makeTempId()

  // snapshot minimo per rollback
  const prevSiblings = this.childrenByParentId[pageId]?.[parentKey] ?? []
  const hadBlockAlready = Boolean(this.blocksById[tempId]) // quasi sempre false

  // 1) inserisci in blocksById
  this.blocksById[tempId] = {
    id: tempId,
    type: postData.type,
    content: postData.content,
    parentId: postData.parent_block,   // nel tuo store sembra sia anchor.parentId
    position: postData.position,
    // opzionali: pageId, createdAt, status...
    __optimistic: true,
  }

  // 2) inserisci nei children
  if (!this.childrenByParentId[pageId]) this.childrenByParentId[pageId] = {}
  this.childrenByParentId[pageId][parentKey] = insertAfter(
    prevSiblings,
    insertAfterId,
    tempId
  )

  try {
    // --- network
    const res = await api.post(`/pages/${pageId}/blocks/`, postData)
    const realId = asStr(res.data.id)

    // --- commit: sostituisci tempId -> realId (senza fetch)
    // 1) blocksById: sposta record
    const optimisticBlock = this.blocksById[tempId]
    if (!optimisticBlock) {
      // caso raro: se qualcuno ha già rollbackato
      return realId
    }

    delete this.blocksById[tempId]
    this.blocksById[realId] = {
      ...optimisticBlock,
      id: realId,
      __optimistic: false,
    }

    // 2) children: rimpiazza id nella lista
    this.childrenByParentId[pageId][parentKey] = replaceId(
      this.childrenByParentId[pageId][parentKey],
      tempId,
      realId
    )

    // 3) se hai map/lookup extra basati su id, aggiornali qui (es: selection/focus queues)
    // if (this.focusRequestId === tempId) this.focusRequestId = realId

    return realId
  } catch (error) {
    // --- rollback: rimuovi blocco ottimistico
    if (!hadBlockAlready) delete this.blocksById[tempId]
    this.childrenByParentId[pageId][parentKey] = removeId(
      this.childrenByParentId[pageId][parentKey],
      tempId
    )

    // riallinea SOLO in caso di rollback (come vuoi tu)
    try {
      await this.fetchBlocksForPage(pageId)
    } catch (e) {
      // se anche fetch fallisce, almeno non crashare qui
      console.warn('Rollback fetch failed:', e)
    }

    console.warn('Error adding new block (optimistic rollback):', error?.response?.data ?? error)
    throw error
  }
},*/

    async addNewBlockAfterAdoptChildren(pageId, payload, blockId) {
      const newId = await this.addNewBlockAfter(pageId, payload, blockId);

      const childKey = String(blockId);
      const childIds = this.childrenByParentId[pageId]?.[childKey] ?? [];
      if (!childIds.length) return newId;

      for (const childId of childIds) {
        await api.patch(`/blocks/${childId}/`, { parent_block: newId });
      }

      await this.fetchBlocksForPage(pageId);
      return newId;
    },
    async addChildBlock(pageId, parentId, payload) {
      pageId = String(pageId);
      parentId = String(parentId);

      try {
        // siblings = figli del parent
        const childKey = parentId;
        const childIds = (
          this.childrenByParentId[pageId]?.[childKey] ?? []
        ).map(String);

        // inserisci come primo figlio (pos prima del primo)
        const firstId = childIds.length ? childIds[0] : null;
        const firstPos = firstId
          ? (this.blocksById[firstId]?.position ?? null)
          : null;
        const newPos = posBetween(null, firstPos);

        const postData = {
          type: payload.type ?? "p",
          content: payload.content ?? { text: "" },
          parent_block: parentId,
          position: newPos,
        };

        const res = await api.post(`/pages/${pageId}/blocks/`, postData);
        await this.fetchBlocksForPage(pageId);
        return String(res.data.id);
      } catch (error) {
        console.warn(
          "Error adding child block:",
          error?.response?.data ?? error,
        );
        throw error;
      }
    },

    // -----------------------------
    // Cycle check (usata in PageView)
    // -----------------------------
    isCircularMove(draggedId, targetParentId, blocksById) {
      if (!targetParentId || targetParentId === "root") return false;
      if (String(draggedId) === String(targetParentId)) return true;

      let currentParentId = String(targetParentId);
      const drag = String(draggedId);

      while (currentParentId) {
        if (currentParentId === drag) return true;
        const parentNode = blocksById[currentParentId];
        if (!parentNode) break;
        currentParentId =
          parentNode.parentId != null ? String(parentNode.parentId) : null;
      }

      return false;
    },
    async transferSubtreeToPage({
      fromPageId,
      toPageId,
      rootId,
      toParentId = null,
      afterBlockId = null,
    }) {
      fromPageId = String(fromPageId);
      toPageId = String(toPageId);
      rootId = String(rootId);
      console.log(
        "fromPageId",
        fromPageId,
        "toPageId",
        toPageId,
        "rootId",
        rootId,
        "toParentId",
        toParentId,
        "afterBlockId",
        afterBlockId,
      );
      try {
        await api.post(`/pages/${fromPageId}/transfer-subtree/`, {
          root_id: rootId,
          to_page_id: toPageId,
          to_parent_block: toParentId,
          after_block_id: afterBlockId,
        });

        // v1 semplice: resync hard
        await this.fetchBlocksForPage(fromPageId);
        await this.fetchBlocksForPage(toPageId);
      } catch (e) {
        // safe resync anche su errore (ti evita store “mezzo rotto”)
        await this.fetchBlocksForPage(fromPageId);
        if (toPageId !== fromPageId) await this.fetchBlocksForPage(toPageId);
        throw e;
      }
    },

    async duplicateBlockInPlace(pageId, blockId) {
      try {
        await api.post(`/blocks/${blockId}/duplicate-subtree/`, {});
        await this.fetchBlocksForPage(pageId);
      } catch (e) {
        console.warn("Error duplicating block:", e?.response?.data ?? e);
        await this.fetchBlocksForPage(pageId);
        throw e;
      }
    },
    /* 
getChildIds(pageId, parentId) {
  pageId = String(pageId)
  const key = parentKeyOf(parentId) // 'root' se null
  return (this.childrenByParentId[pageId]?.[key] ?? []).map(String)
},

computeAppendPosition(pageId, parentId) {
  pageId = String(pageId)
  const key = parentKeyOf(parentId)
  const arr = (this.childrenByParentId[pageId]?.[key] ?? []).map(String)
  const lastId = arr.at(-1) ?? null
  const lastPos = lastId ? (this.blocksById[lastId]?.position ?? null) : null
  return posBetween(lastPos, null)
},

// snapshot-aware children getter (per duplication/move subtree)
_makeSnapshotChildren(pageId) {
  const m = this.childrenByParentId[String(pageId)] ?? {}
  // shallow clone delle liste per sicurezza
  const snap = {}
  for (const k of Object.keys(m)) snap[k] = (m[k] ?? []).map(String)
  return snap
},
_getChildIdsFromSnap(snapMap, parentId) {
  const key = parentKeyOf(parentId)
  return (snapMap[key] ?? []).map(String)
},

_collectSubtreePostOrderFromSnap(snapMap, rootId) {
  rootId = String(rootId)
  const out = []
  const visit = (id) => {
    const children = this._getChildIdsFromSnap(snapMap, id)
    for (const cid of children) visit(cid)
    out.push(id)
  }
  visit(rootId)
  return out
},

async cloneSubtreeToPage({ fromPageId, toPageId, rootId, insertAfterId = null, targetParentId = null }) {
  fromPageId = String(fromPageId)
  toPageId = String(toPageId)
  rootId = String(rootId)

  const srcRoot = this.blocksById[rootId]
  if (!srcRoot) throw new Error('root not found')

  // snapshot children della pagina sorgente (o stessa pagina)
  const snap = this._makeSnapshotChildren(fromPageId)

  // 1) calcola parent/position del nuovo root nel target
  let rootParentId = targetParentId ?? null
  let rootPosition = null

  if (insertAfterId) {
    // inserisci dopo un blocco anchor nel target (stesso parent dell’anchor)
    const { parentId, position } = this.computeInsertPositionAfter(toPageId, insertAfterId)
    rootParentId = parentId ?? null
    rootPosition = position
  } else {
    // append nel parent scelto
    rootPosition = this.computeAppendPosition(toPageId, rootParentId)
  }

  // mappa vecchio->nuovo id
  const idMap = new Map()

  const createOne = async (srcId, newParentId, position) => {
    const src = this.blocksById[String(srcId)]
    if (!src) throw new Error(`missing src node ${srcId}`)

    const payload = {
      type: src.type,
      content: src.content ?? { text: '' },
      props: normalizeProps(src.props),
      layout: src.layout ?? {},
      width: src.width ?? null,
      parent_block: newParentId ?? null,
      position: String(position ?? ''),
      kind: src.kind ?? 'block',
    }

    const res = await api.post(`/pages/${toPageId}/blocks/`, payload)
    return String(res.data.id)
  }

  // 2) crea root
  const newRootId = await createOne(rootId, rootParentId, rootPosition)
  idMap.set(rootId, newRootId)

  // 3) DFS: per ogni parent creato, crea i figli in ordine e append
  const cloneChildren = async (srcParentId) => {
    const newParent = idMap.get(String(srcParentId))
    if (!newParent) return

    const childIds = this._getChildIdsFromSnap(snap, srcParentId) // ordine stabile
    for (const childId of childIds) {
      const pos = this.computeAppendPosition(toPageId, newParent) // append nel nuovo parent
      const newChildId = await createOne(childId, newParent, pos)
      idMap.set(String(childId), newChildId)
      await cloneChildren(childId)
    }
  }

  await cloneChildren(rootId)

  return { newRootId, idMap }
},
async deleteSubtree(pageId, rootId) {
  pageId = String(pageId)
  rootId = String(rootId)

  const snap = this._makeSnapshotChildren(pageId)
  const ids = this._collectSubtreePostOrderFromSnap(snap, rootId)

  // optimistic local (children first)
  for (const id of ids) {
    this.applyDeleteLocal(pageId, id)
  }

  try {
    for (const id of ids) {
      await api.delete(`/blocks/${String(id)}/`)
    }
  } catch (e) {
    await this.fetchBlocksForPage(pageId) // hard resync
    throw e
  }
},
async duplicateSubtree(pageId, rootId) {
  pageId = String(pageId)
  rootId = String(rootId)

  const { newRootId } = await this.cloneSubtreeToPage({
    fromPageId: pageId,
    toPageId: pageId,
    rootId,
    insertAfterId: rootId, // duplica subito dopo
  })

  await this.fetchBlocksForPage(pageId)
  return newRootId
},
async moveSubtreeToPage({ fromPageId, toPageId, rootId, insertAfterId = null, targetParentId = null }) {
  fromPageId = String(fromPageId)
  toPageId = String(toPageId)
  rootId = String(rootId)

  const { newRootId } = await this.cloneSubtreeToPage({
    fromPageId,
    toPageId,
    rootId,
    insertAfterId,
    targetParentId,
  })

  await this.deleteSubtree(fromPageId, rootId)

  // refresh entrambe
  await this.fetchBlocksForPage(fromPageId)
  if (toPageId !== fromPageId) await this.fetchBlocksForPage(toPageId)

  return newRootId
},*/

    // -----------------------------
    // LEGACY
    // -----------------------------

    /*
    // Old helpers
    setSiblingsOrder(pageId, parentKey, ids) {
      this.childrenByParentId[pageId][parentKey] = ids
    },

    setBlockPosition(pageId, blockId, position) {
      this.blocksById[String(blockId)].position = position
    },

    // Old move APIs (pre-dnd refactor)
    async moveBlockInside(pageId, blockId, newParentId) { ... }

    async moveBlockToParentAtIndex(pageId, blockId, newParentId, insertIndex) { ... }

    // Duplicate cycle checks (you can remove one)
    wouldCreateCycle_Block(dragId, candidateParentId) { ... }

    // Old optimistic move (replaced by applyMoveLocal)
    updateBlockLocationOptimistic(blockId, pageId, { newParentId, newPosition }) { ... }
    */
  },
});

export default useBlocksStore;
