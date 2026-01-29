import { defineStore } from "pinia";
import api from "@/services/api";

export interface TiptapDoc {
  id: string;
  pageId: string;
  content: Record<string, any>;
  version: number;
  createdAt: string | null;
  updatedAt: string | null;
}

interface RawTiptapDoc {
  id: string;
  page: string;
  content: Record<string, any> | null;
  version: number | null;
  created_at: string | null;
  updated_at: string | null;
}

interface DocStoreState {
  docsByPage: Record<string, TiptapDoc>;
  isLoadingByPage: Record<string, boolean>;
  isSavingByPage: Record<string, boolean>;
  errorByPage: Record<string, any>;
  _fetchTokenByPage: Record<string, number>;
  currentDocKey: string | null;
  currentDocNodeId: string | null;
}

function normalizeDoc(raw: RawTiptapDoc): TiptapDoc {
  return {
    id: String(raw.id),
    pageId: String(raw.page),
    content: raw.content ?? {},
    version: raw.version ?? 1,
    createdAt: raw.created_at ?? null,
    updatedAt: raw.updated_at ?? null,
  };
}

export const useDocStore = defineStore("docStore", {
  state: (): DocStoreState => ({
    docsByPage: {},
    isLoadingByPage: {},
    isSavingByPage: {},
    errorByPage: {},
    _fetchTokenByPage: {},
    currentDocKey: null,
    currentDocNodeId: null,
  }),

  getters: {
    docForPage:
      (state) =>
      (pageId: string | number): TiptapDoc | null => {
        const id = String(pageId);
        return state.docsByPage[id] ?? null;
      },
    isSavingForPage:
      (state) =>
      (pageId: string | number): boolean => {
        const id = String(pageId);
        return Boolean(state.isSavingByPage[id]);
      },
  },

  actions: {
    setCurrentDocKey(docKey: string | null) {
      this.currentDocKey = docKey;
    },
    setCurrentDocNodeId(docNodeId: string | null) {
      this.currentDocNodeId = docNodeId;
    },
    setSaving(pageId: string | number, isSaving: boolean) {
      const id = String(pageId);
      this.isSavingByPage[id] = isSaving;
    },
    clearCurrentDoc() {
      this.currentDocKey = null;
      this.currentDocNodeId = null;
    },
    setLocalContent(pageId: string | number, content: Record<string, any>) {
      const id = String(pageId);
      const existing = this.docsByPage[id];
      if (!existing) {
        this.docsByPage[id] = {
          id: "",
          pageId: id,
          content: content ?? {},
          version: 1,
          createdAt: null,
          updatedAt: null,
        };
        return;
      }
      existing.content = content ?? {};
    },

    updateDocContent(pageId: string | number, content: Record<string, any>) {
      const id = String(pageId);
      const existing = this.docsByPage[id];
      if (!existing) {
        this.docsByPage[id] = {
          id: "",
          pageId: id,
          content: content ?? {},
          version: 1,
          createdAt: null,
          updatedAt: null,
        };
        return this.docsByPage[id];
      }
      existing.content = content ?? {};
      return existing;
    },

    async fetchDoc(pageId: string | number): Promise<TiptapDoc> {
      const id = String(pageId);
      const token = (this._fetchTokenByPage[id] ?? 0) + 1;
      this._fetchTokenByPage[id] = token;
      this.isLoadingByPage[id] = true;
      this.errorByPage[id] = null;

      try {
        const res = await api.get(`/pages/${id}/doc/`);
        if (this._fetchTokenByPage[id] !== token) {
          return this.docsByPage[id] as TiptapDoc;
        }
        const doc = normalizeDoc(res.data as RawTiptapDoc);
        this.docsByPage[id] = doc;
        return doc;
      } catch (error) {
        this.errorByPage[id] = error;
        throw error;
      } finally {
        if (this._fetchTokenByPage[id] === token) {
          this.isLoadingByPage[id] = false;
        }
      }
    },

    async saveDoc(
      pageId: string | number,
      payload: { content?: Record<string, any>; version?: number },
      opts?: { replace?: boolean },
    ): Promise<TiptapDoc> {
      const id = String(pageId);
      const method = opts?.replace ? "put" : "patch";
      const res = await api[method](`/pages/${id}/doc/`, payload ?? {});
      const doc = normalizeDoc(res.data as RawTiptapDoc);
      this.docsByPage[id] = doc;
      return doc;
    },

    clearDoc(pageId: string | number) {
      const id = String(pageId);
      delete this.docsByPage[id];
      delete this.isLoadingByPage[id];
      delete this.isSavingByPage[id];
      delete this.errorByPage[id];
      delete this._fetchTokenByPage[id];
    },
  },
});

export default useDocStore;
