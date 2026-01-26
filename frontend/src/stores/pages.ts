import { defineStore } from "pinia";
import api from "@/services/api";
import { posBetween } from "@/domain/position";
import { useBlocksStore } from "@/stores/blocks";

// ===========================
// TYPE DEFINITIONS
// ===========================

interface Page {
  id: string | number;
  title: string;
  parentId: string | number | null;
  position: string;
  createdAt: string;
  updatedAt: string;
  icon: string;
  favorite: boolean;
  favorite_position: string | null;
}

interface RawPage {
  id: string | number;
  title: string;
  parent: string | number | null;
  position: string;
  created_at: string;
  updated_at: string;
  icon: string;
  favorite: boolean;
  favorite_position: string | null;
}

interface DraftPageData {
  title: string;
}

interface RenderRow {
  page: Page;
  level: number;
}

interface PagesStoreState {
  // Data
  pages: Page[];
  pagesById: Record<string | number, Page>;
  childrenByParentId: Record<string, (string | number)[]>;
  expandedById: Record<string | number, boolean>;

  // Selection/Editing
  currentPageId: string | number | null;
  editingPageId: string | number | null;
  draftPage: DraftPageData;
  originalPage: DraftPageData;

  // Focus
  pendingFocusTitlePageId: string | number | null;
}

interface PagePayload {
  title?: string;
  parent?: string | number | null;
  position?: string;
  icon?: string;
  favorite?: boolean;
}

interface DuplicateBlockPayload {
  type: string;
  content: any;
  position: string;
  parentId: string | number | null;
}

// ===========================
// HELPER FUNCTIONS
// ===========================

function normalizePage(raw: RawPage): Page {
  return {
    id: raw.id,
    title: raw.title ? raw.title : "Untitled",
    parentId: raw.parent,
    position: raw.position,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    icon: raw.icon,
    favorite: raw.favorite,
    favorite_position: raw.favorite_position,
  };
}

const KEY_ROOT = "root";
const parentKeyOf = (parentId: string | number | null): string =>
  parentId == null ? KEY_ROOT : String(parentId);

// ===========================
// STORE DEFINITION
// ===========================

export const usePagesStore = defineStore("pagesStore", {
  state: (): PagesStoreState => ({
    // Data
    pages: [],
    pagesById: {},
    childrenByParentId: {},
    expandedById: {},

    // Selection/Editing
    currentPageId: null,
    editingPageId: null,
    draftPage: { title: "" },
    originalPage: { title: "" },

    // Focus
    pendingFocusTitlePageId: null,
  }),

  getters: {
    renderRowsPages(state): RenderRow[] {
      const pagesMap = state.childrenByParentId ?? {};
      const out: Array<{ id: string | number; level: number }> = [];

      const visit = (parentKey: string, level: number): void => {
        const childIds = pagesMap[parentKey] ?? [];

        for (const id of childIds) {
          const page = state.pagesById[id];
          if (!page) continue;
          out.push({ id, level });
          if (state.expandedById[id]) {
            visit(String(id), level + 1);
          }
        }
      };

      visit(KEY_ROOT, 0);
      const flat = out ?? [];

      return flat
        .map(({ id, level }) => {
          const page = state.pagesById[id];
          return page ? { page, level } : null;
        })
        .filter((item): item is RenderRow => item !== null);
    },

    hasChildren:
      (state) =>
      (pageId: string | number): boolean => {
        const hasChildren = state.childrenByParentId[String(pageId)]
          ? true
          : false;
        return hasChildren;
      },

    isExpanded:
      (state) =>
      (pageId: string | number): boolean => {
        const isExpanded = state.expandedById[pageId] ? true : false;
        return isExpanded;
      },

    getParentKey:
      (state) =>
      (parentId: string | number | null): string => {
        const parentKey = parentKeyOf(parentId);
        return parentKey;
      },
  },

  actions: {
    // ===========================
    // FOCUS MANAGEMENT
    // ===========================

    requestTitleFocus(pageId: string | number): void {
      this.pendingFocusTitlePageId = pageId;
    },

    consumeTitleFocusRequest(pageId: string | number): boolean {
      if (this.pendingFocusTitlePageId === pageId) {
        this.pendingFocusTitlePageId = null;
        return true;
      }
      return false;
    },

    // ===========================
    // FETCH
    // ===========================

    async fetchPagesK(): Promise<void> {
      try {
        const response = await api.get("/pages/");
        this.pages = response.data;
      } catch (error) {
        console.warn("Error in pages fetching:", error);
        throw error;
      }
    },

    async fetchPages(): Promise<void> {
      try {
        const response = await api.get("/pages/");
        const pages = (response.data || []) as RawPage[];
        const normPages = pages.map((p1) => normalizePage(p1));

        this.pagesById = normPages.reduce(
          (dict: Record<string | number, Page>, page) => {
            dict[page.id] = page;
            return dict;
          },
          {},
        );

        this.childrenByParentId = normPages.reduce(
          (dict: Record<string, (string | number)[]>, page) => {
            const parentKey = parentKeyOf(page.parentId);
            if (!dict[parentKey]) dict[parentKey] = [];
            dict[parentKey].push(page.id);
            return dict;
          },
          {},
        );

        Object.values(this.childrenByParentId).forEach((childIds) => {
          childIds.sort((idA, idB) => {
            const posA = (this.pagesById[idA]?.position ?? "\uffff") as string;
            const posB = (this.pagesById[idB]?.position ?? "\uffff") as string;
            const cmp = posA < posB ? -1 : posA > posB ? 1 : 0;
            return cmp !== 0 ? cmp : String(idA).localeCompare(String(idB));
          });
        });
      } catch (error) {
        console.warn("Error in pages fetching:", error);
        throw error;
      }
    },

    // ===========================
    // ADD PAGES
    // ===========================

    async addPage(payload: { title: string }): Promise<void> {
      try {
        await api.post("/pages/", { title: payload.title });
      } catch (error) {
        console.warn("Error in adding page:", error);
        throw error;
      }
    },

    async addChildPage(
      parentId: string | number | null,
    ): Promise<string | number> {
      try {
        const parentKey = parentKeyOf(parentId);
        const childIds = this.childrenByParentId[parentKey] ?? [];
        const lastIdx = childIds.length > 0 ? childIds.length - 1 : null;

        const lastChildId = lastIdx !== null ? childIds[lastIdx] : null;
        let lastPos = lastChildId
          ? (this.pagesById[lastChildId]?.position ?? null)
          : null;

        const newPos = posBetween(lastPos, null);

        const res = await api.post("/pages/", {
          parent: parentId,
          position: newPos,
        });

        await this.fetchPages();
        const newId = res.data.id;
        return newId;
      } catch (error) {
        console.warn("Error in adding page:", error);
        throw error;
      }
    },

    async addPageAfterId(
      prevPageId: string | number,
    ): Promise<string | number> {
      try {
        const prev = this.pagesById[prevPageId];
        if (!prev) {
          // fallback: reload and retry
          await this.fetchPages();
          const prev2 = this.pagesById[prevPageId];
          if (!prev2)
            throw new Error(
              `addPageAfterId: prevPageId ${prevPageId} not found`,
            );
          return await this.addPageAfterId(prevPageId);
        }

        const parentId = prev.parentId ?? null;
        const parentKey = parentKeyOf(parentId);

        const siblingIds = this.childrenByParentId[parentKey] ?? [];
        // ensure order by position
        const ordered = [...siblingIds].sort((idA, idB) => {
          const posA = (this.pagesById[idA]?.position ?? "\uffff") as string;
          const posB = (this.pagesById[idB]?.position ?? "\uffff") as string;
          const cmp = posA < posB ? -1 : posA > posB ? 1 : 0;
          return cmp !== 0 ? cmp : String(idA).localeCompare(String(idB));
        });

        const idx = ordered.indexOf(prevPageId);
        // if not found among siblings (state misalignment), refetch
        if (idx === -1) {
          await this.fetchPages();
          return await this.addPageAfterId(prevPageId);
        }

        const nextId = ordered[idx + 1] ?? null;
        const prevPos = (this.pagesById[prevPageId]?.position ?? null) as
          | string
          | null;
        const nextPos = nextId
          ? ((this.pagesById[nextId]?.position ?? null) as string | null)
          : null;

        const newPos = posBetween(prevPos, nextPos);

        const res = await api.post("/pages/", {
          parent: parentId,
          position: newPos,
        });

        await this.fetchPages();

        return res.data.id;
      } catch (error) {
        console.warn("Error in addPageAfterId:", error);
        throw error;
      }
    },

    // ===========================
    // MOVE/REORDER
    // ===========================

    async movePageInside(
      pageId: string | number,
      newParentId: string | number | null,
    ): Promise<void> {
      const newParentKey = parentKeyOf(newParentId);
      const newSiblingsIds = this.childrenByParentId[newParentKey] ?? [];
      const lastSiblingId = newSiblingsIds[newSiblingsIds.length - 1] ?? null;

      const lastSiblingPos = lastSiblingId
        ? (this.pagesById[lastSiblingId]?.position ?? null)
        : null;

      const newPos = posBetween(lastSiblingPos, null);

      const payload: PagePayload = {
        parent: newParentId,
        position: newPos,
      };

      await this.patchPage(pageId, payload);
      await this.fetchPages();
    },

    async movePageToParentAtIndex(
      pageId: string | number,
      newParentId: string | number | null,
      insertIndex: number,
    ): Promise<void> {
      const pageIdStr = String(pageId);
      const page = this.pagesById[pageIdStr];
      if (!page) return;

      const oldParentId = page.parentId ?? null;
      const oldKey = parentKeyOf(oldParentId);
      const newKey = parentKeyOf(newParentId);

      const oldSiblings = [...(this.childrenByParentId[oldKey] ?? [])].map(
        String,
      );
      const newSiblings =
        oldKey === newKey
          ? oldSiblings
          : [...(this.childrenByParentId[newKey] ?? [])].map(String);

      // remove from old
      const filteredOld = oldSiblings.filter((id) => id !== pageIdStr);
      this.childrenByParentId[oldKey] = filteredOld as any;

      // insert into new
      const filteredNew = (
        oldKey === newKey ? filteredOld : newSiblings
      ).filter((id) => id !== pageIdStr);
      const idx = Math.max(0, Math.min(insertIndex, filteredNew.length));
      filteredNew.splice(idx, 0, pageIdStr);
      this.childrenByParentId[newKey] = filteredNew as any;

      // calculate prev/next in new
      const prevId = filteredNew[idx - 1] ?? null;
      const nextId = filteredNew[idx + 1] ?? null;
      const prevPos = (
        prevId ? (this.pagesById[prevId]?.position ?? null) : null
      ) as string | null;
      const nextPos = (
        nextId ? (this.pagesById[nextId]?.position ?? null) : null
      ) as string | null;
      const newPos = posBetween(prevPos, nextPos);

      // optimistic page update
      page.parentId = newParentId;
      page.position = newPos;

      // persist
      await this.patchPage(pageIdStr, {
        parent: newParentId,
        position: newPos,
      });
      await this.fetchPages();
    },

    async movePageToParentAppend(
      pageId: string | number,
      newParentId: string | number | null,
    ): Promise<void> {
      const id = String(pageId);
      const page = this.pagesById[id];
      if (!page) return;

      const nextParentId = newParentId == null ? null : String(newParentId);

      // no-op check
      if (String(page.parentId ?? "") === String(nextParentId ?? "")) return;

      // block cycles
      if (this.wouldCreateCycle_Page?.(id, nextParentId)) return;

      const oldParentKey = parentKeyOf(page.parentId ?? null);
      const newParentKey = parentKeyOf(nextParentId);

      const oldSibs = [...(this.childrenByParentId[oldParentKey] ?? [])].map(
        String,
      );
      const newSibs = [...(this.childrenByParentId[newParentKey] ?? [])].map(
        String,
      );

      // position at end
      const lastId = newSibs.length ? newSibs[newSibs.length - 1] : null;
      const lastPos = lastId
        ? ((this.pagesById[lastId]?.position ?? null) as string | null)
        : null;
      const newPos = posBetween(lastPos, null);

      // optimistic: remove from old, append to new
      this.childrenByParentId[oldParentKey] = oldSibs.filter(
        (x) => x !== id,
      ) as any;
      this.childrenByParentId[newParentKey] = [...newSibs, id] as any;

      page.parentId = nextParentId;
      page.position = newPos;

      // persist
      await this.patchPage(id, { parent: nextParentId, position: newPos });
    },

    async reparentChildrenToParent(pageId: string | number): Promise<void> {
      console.log("reparenting");
      const id = String(pageId);
      const p = this.pagesById[id];
      if (!p) return;

      const fromParentKey = parentKeyOf(id);
      const children = [...(this.childrenByParentId[fromParentKey] ?? [])].map(
        String,
      );
      if (!children.length) return;

      const newParentId = p.parentId ?? null;
      const toKey = parentKeyOf(newParentId);
      console.log("toKey:", toKey);
      const dest = [...(this.childrenByParentId[toKey] ?? [])].map(String);

      // position at end: between lastPos and null
      const lastId = dest.length ? dest[dest.length - 1] : null;
      let prevPos = lastId
        ? ((this.pagesById[lastId]?.position ?? null) as string | null)
        : null;
      console.log("prevPos:", prevPos);

      for (const childId of children) {
        const child = this.pagesById[childId];
        if (!child) continue;

        const newPos = posBetween(prevPos, null);
        prevPos = newPos;

        // optimistic local
        child.parentId = newParentId;
        child.position = newPos;
        console.log("child:", child, "pos:", newPos, "newParent:", newParentId);

        // update in-memory structures
        this.childrenByParentId[fromParentKey] = (
          this.childrenByParentId[fromParentKey] ?? []
        ).filter((x) => String(x) !== childId) as any;
        this.childrenByParentId[toKey] = [
          ...(this.childrenByParentId[toKey] ?? []).map(String),
          childId,
        ] as any;

        // persist
        await this.patchPage(childId, {
          parent: newParentId,
          position: newPos,
        });
      }
    },

    // ===========================
    // EXPAND/COLLAPSE
    // ===========================

    expandPage(pageId: string | number): void {
      this.expandedById[pageId] = true;
    },

    toggleExpandPage(pageId: string | number): void {
      this.expandedById[pageId] = this.expandedById[pageId] ? false : true;
    },

    collapseAll(): void {
      this.expandedById = {};
    },

    ensureVisible(pageId: string | number): void {
      const id = String(pageId);
      let cur = this.pagesById[id];
      if (!cur) return;

      // expand all parents up to root
      let parentId = cur.parentId ?? null;
      while (parentId != null) {
        const pid = String(parentId);
        this.expandedById[pid] = true;
        const p = this.pagesById[pid];
        parentId = p?.parentId ?? null;
      }
    },

    // ===========================
    // OPEN/SELECT
    // ===========================

    async openPage(pageId: string | number): Promise<void> {
      try {
        const response = await api.get(`/pages/${pageId}`);
        this.currentPageId = response.data.id;
      } catch (error) {
        console.warn("Error opening page:", error);
        throw error;
      }
    },

    // ===========================
    // EDIT
    // ===========================

    startEdit(pageId: string | number): void {
      this.editingPageId = pageId;
      const page = this.pagesById[pageId];
      this.draftPage = { title: page.title };
      this.originalPage = { title: page.title };
    },

    cancelEdit(): void {
      this.editingPageId = null;
      this.draftPage = { title: "" };
      this.originalPage = { title: "" };
    },

    async commitEdit(pageId: string | number): Promise<void> {
      const page = this.pagesById[pageId];
      try {
        const payload: PagePayload = { title: this.draftPage.title };
        await this.patchPage(page.id, payload);
        this.cancelEdit();
        await this.fetchPages();
      } catch (error) {
        console.warn("Error editing title:", error);
        throw error;
      }
    },

    // ===========================
    // PATCH/UPDATE
    // ===========================

    async patchPage(
      pageId: string | number,
      payload: PagePayload,
    ): Promise<any> {
      if (payload.title !== undefined && String(payload.title).trim() === "") {
        payload.title = "Untitled";
      }
      const res = await api.patch(`/pages/${pageId}/`, payload);
      return res;
    },

    updatePageLocationOptimistic(
      pageId: string | number,
      {
        newParentId,
        newPosition,
      }: { newParentId: string | number | null; newPosition: string },
    ): void {
      const page = this.pagesById[pageId];
      if (!page) return;

      const oldParentKey = page.parentId || KEY_ROOT;
      const newParentKey = newParentId || KEY_ROOT;

      page.parentId = newParentId;
      page.position = newPosition;

      if (this.childrenByParentId[String(oldParentKey)]) {
        this.childrenByParentId[String(oldParentKey)] = this.childrenByParentId[
          String(oldParentKey)
        ].filter((id) => id !== pageId);
      }

      if (!this.childrenByParentId[String(newParentKey)]) {
        this.childrenByParentId[String(newParentKey)] = [];
      }

      if (!this.childrenByParentId[String(newParentKey)].includes(pageId)) {
        this.childrenByParentId[String(newParentKey)].push(pageId);
      }

      this.childrenByParentId[String(newParentKey)].sort((idA, idB) => {
        const posA = (this.pagesById[idA]?.position ?? "") as string;
        const posB = (this.pagesById[idB]?.position ?? "") as string;

        if (posA < posB) return -1;
        if (posA > posB) return 1;
        return 0;
      });
    },

    // ===========================
    // DELETE
    // ===========================

    async deletePage(pageId: string | number): Promise<void> {
      try {
        if (this.currentPageId && this.currentPageId === pageId) {
          // Handle current page deletion if needed
        }
        await api.delete(`/pages/${pageId}/`);
        await this.fetchPages();
      } catch (error) {
        console.warn("Error deleting page:", error);
        throw error;
      }
    },

    getNextPageIdAfterDelete(pageId: string | number): string | number | null {
      const id = String(pageId);
      const p = this.pagesById[id];
      if (!p) return null;

      const parentId = p.parentId ?? null;
      const key = parentKeyOf(parentId);
      const sibs = [...(this.childrenByParentId[key] ?? [])].map(String);
      const idx = sibs.indexOf(id);

      // next sibling
      if (idx !== -1 && idx + 1 < sibs.length) return sibs[idx + 1];
      // previous sibling
      if (idx !== -1 && idx - 1 >= 0) return sibs[idx - 1];
      // parent
      if (parentId != null) return String(parentId);
      // fallback: first root
      const rootSibs = [
        ...(this.childrenByParentId[parentKeyOf(null)] ?? []),
      ].map(String);
      return rootSibs[0] ?? null;
    },

    // ===========================
    // FAVORITE
    // ===========================

    async toggleFavorite(pageId: string | number): Promise<void> {
      const id = String(pageId);
      const page = this.pagesById[id];
      if (!page) return;

      const newFavoriteStatus = !page.favorite;

      // Optimistic update
      page.favorite = newFavoriteStatus;
      try {
        await this.patchPage(id, { favorite: newFavoriteStatus });
      } catch (error) {
        // Revert in case of error
        page.favorite = !newFavoriteStatus;
        console.error("Error toggling favorite status:", error);
      }
    },

    hasFavoritePages(): boolean {
      return Object.values(this.pagesById).some((page) => page.favorite);
    },

    // ===========================
    // CYCLE CHECK
    // ===========================

    wouldCreateCycle_Page(
      dragId: string | number,
      candidateParentId: string | number | null,
    ): boolean {
      // candidateParentId = new parent you want to assign to dragId
      if (candidateParentId == null) return false;

      const drag = String(dragId);
      let cur = String(candidateParentId);

      while (cur != null) {
        if (cur === drag) return true;
        const p = this.pagesById[cur];
        cur = p?.parentId != null ? String(p.parentId) : (null as any);
      }
      return false;
    },

    isCircularMove(
      draggedId: string | number,
      targetParentId: string | number | null,
      pagesById: Record<string | number, Page>,
    ): boolean {
      // If moving to root (null), can't be circular
      if (!targetParentId || targetParentId === "root") return false;

      // If trying to drop on self (impossible from UI, but for safety)
      if (draggedId === targetParentId) return true;

      let currentParentId: string | number | null = targetParentId;

      while (currentParentId) {
        if (currentParentId === draggedId) return true;

        const parentNode: Page | undefined = pagesById[currentParentId];

        if (!parentNode) break;
        currentParentId = parentNode.parentId ?? null;
      }

      return false;
    },

    // ===========================
    // UTILITIES
    // ===========================

    setSiblingsOrder(parentKey: string, ids: (string | number)[]): void {
      this.childrenByParentId[parentKey] = ids;
    },

    setPagePosition(pageId: string | number, position: string): void {
      const page = this.pagesById[String(pageId)];
      if (page) page.position = position;
    },

    anyPage(): boolean {
      return Object.keys(this.pagesById).length > 0;
    },

    childrenOf(parentId: string | number | null): Page[] {
      const key = parentId == null ? "root" : String(parentId);
      return (this.childrenByParentId[key] ?? [])
        .map((id) => this.pagesById[String(id)])
        .filter((p): p is Page => Boolean(p))
        .sort((a, b) => String(a.position).localeCompare(String(b.position)));
    },

    collectDescendantsIds(
      pageId: string | number,
      childrenByParentId: Record<string, (string | number)[]>,
    ): Set<string> {
      const out = new Set<string>();
      const stack = [String(pageId)];

      while (stack.length) {
        const cur = stack.pop()!;
        const kids = (childrenByParentId?.[parentKeyOf(cur)] ?? []).map(String);

        for (const k of kids) {
          if (out.has(k)) continue;
          out.add(k);
          stack.push(k);
        }
      }

      return out;
    },

    // ===========================
    // DUPLICATE
    // ===========================

    async duplicatePageDeep(
      sourcePageId: string | number,
    ): Promise<string | number> {
      const blocksStore = useBlocksStore();

      const src = this.pagesById[String(sourcePageId)];
      if (!src) throw new Error("Source page not found");

      // 1) compute new page position (immediately after)
      const parentId = src.parentId ?? null;
      const parentKey = parentKeyOf(parentId);
      const siblings = [...(this.childrenByParentId[parentKey] ?? [])].map(
        String,
      );

      const idx = siblings.indexOf(String(sourcePageId));
      const nextId = idx >= 0 ? (siblings[idx + 1] ?? null) : null;

      const nextPos = nextId
        ? ((this.pagesById[String(nextId)]?.position ?? null) as string | null)
        : null;
      const newPos = posBetween(src.position ?? null, nextPos);

      // 2) create new page
      const payload: PagePayload = {
        title: `Copy of ${src.title || "Untitled"}`,
        icon: src.icon ?? "",
        parent: parentId,
        position: newPos,
      };

      const created = await api.post("/pages/", payload);
      const newPage = created.data as RawPage;
      const newPageId = String(newPage.id);

      // insert page into store
      this.pagesById[newPageId] = normalizePage(newPage);
      if (idx >= 0) {
        const nextSibs = siblings.slice();
        nextSibs.splice(idx + 1, 0, newPageId);
        this.childrenByParentId[parentKey] = nextSibs as any;
      }

      // 3) fetch blocks for source page
      await blocksStore.fetchBlocksForPage(String(sourcePageId));

      // 4) get preorder rows
      const rows = blocksStore.renderRowsForPage(String(sourcePageId));

      // 5) clone blocks preserving parent mapping
      const idMap = new Map<string, string>();

      for (const row of rows) {
        const b = row.block;
        const oldId = String(b.id);
        const oldParentId = b.parentId != null ? String(b.parentId) : null;
        const newParentId = oldParentId
          ? (idMap.get(oldParentId) ?? null)
          : null;

        const createPayload: DuplicateBlockPayload = {
          type: b.type,
          content: b.content,
          position: b.position,
          parentId: newParentId,
        };

        const res = await api.post(
          `/pages/${newPageId}/blocks/`,
          createPayload,
        );
        const newBlock = res.data;
        idMap.set(oldId, String(newBlock.id));
      }

      // 6) fetch blocks for new page
      await blocksStore.fetchBlocksForPage(newPageId);

      return newPageId;
    },

    async duplicatePageTransactional(
      sourcePageId: string | number,
    ): Promise<string | number> {
      const blocksStore = useBlocksStore();
      console.log("DUPLICATE PAGE TRANSACTIONAL:", sourcePageId);

      const res = await api.post(`/pages/${sourcePageId}/duplicate-deep/`, {
        include_children: true,
      });

      const newPageId = res.data.new_page_id;

      await this.fetchPages();
      await blocksStore.fetchBlocksForPage(newPageId);
      return res.data.new_page_id;
    },
  },
});

export default usePagesStore;
