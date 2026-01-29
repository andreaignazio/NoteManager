import { defineStore } from "pinia";
import api from "@/services/api";

const COMMENTS_WS_URL =
  import.meta.env.VITE_COMMENTS_WS_URL || "ws://localhost:8000/ws/comments";

export type CommentUser = {
  id: string | number;
  username: string;
  first_name?: string;
  last_name?: string;
  email?: string;
};

export type CommentItem = {
  id: string;
  thread: string;
  author: CommentUser | null;
  body: string;
  created_at: string;
  updated_at: string;
};

export type CommentThread = {
  id: string;
  page: string;
  doc_node_id: string;
  created_by: CommentUser | null;
  resolved: boolean;
  created_at: string;
  updated_at: string;
  comments?: CommentItem[];
};

const nodeKey = (pageId: string | number, docNodeId: string | number) =>
  `${pageId}:${docNodeId}`;

const normalizeId = (value: unknown) => String(value ?? "");

export const useCommentsStore = defineStore("commentsStore", {
  state: () => ({
    threadsById: {} as Record<string, CommentThread>,
    threadIdsByNode: {} as Record<string, string[]>,
    commentsByThread: {} as Record<string, CommentItem[]>,
    loadingByNode: {} as Record<string, boolean>,
    loadingByPage: {} as Record<string, boolean>,
    countsByNode: {} as Record<string, number>,
    realtimeSocket: null as WebSocket | null,
    realtimePageId: null as string | null,
  }),

  actions: {
    getCountByNode(pageId: string | number, docNodeId: string) {
      return this.countsByNode[nodeKey(pageId, docNodeId)] ?? 0;
    },

    getThreadCount(thread: CommentThread) {
      const list = this.commentsByThread?.[thread.id] ?? null;
      if (list) return list.length;
      if (Array.isArray(thread.comments)) return thread.comments.length;
      return 0;
    },

    recomputeNodeCount(pageId: string | number, docNodeId: string) {
      const key = nodeKey(pageId, docNodeId);
      const threads = Object.values(this.threadsById || {}).filter(
        (t) =>
          t && String(t.page) === String(pageId) && t.doc_node_id === docNodeId,
      );
      const total = threads.reduce((sum, t) => sum + this.getThreadCount(t), 0);
      if (total > 0) this.countsByNode[key] = total;
      else delete this.countsByNode[key];
    },

    removeThread(pageId: string | number, threadId: string, docNodeId: string) {
      delete this.threadsById[threadId];
      delete this.commentsByThread[threadId];
      const key = nodeKey(pageId, docNodeId);
      const list = this.threadIdsByNode[key] ?? [];
      this.threadIdsByNode[key] = list.filter((id) => id !== threadId);
      this.recomputeNodeCount(pageId, docNodeId);
    },

    applyThread(thread: CommentThread) {
      if (!thread || thread.resolved) return;
      this.threadsById[thread.id] = thread;
      if (thread.comments) {
        this.commentsByThread[thread.id] = thread.comments;
      }
      const key = nodeKey(thread.page, thread.doc_node_id);
      const list = this.threadIdsByNode[key] ?? [];
      if (!list.includes(thread.id)) {
        this.threadIdsByNode[key] = [thread.id, ...list];
      }
      this.recomputeNodeCount(thread.page, thread.doc_node_id);
    },

    applyComment(
      pageId: string | number,
      docNodeId: string,
      threadId: string,
      comment: CommentItem,
    ) {
      const list = this.commentsByThread[threadId] ?? [];
      const nextId = normalizeId(comment?.id);
      if (!list.some((c) => normalizeId(c.id) === nextId)) {
        this.commentsByThread[threadId] = [...list, comment];
      }
      if (this.threadsById[threadId]) {
        this.recomputeNodeCount(pageId, docNodeId);
      }
    },

    connectRealtime(pageId: string | number, token?: string | null) {
      const pageKey = String(pageId);
      if (this.realtimePageId === pageKey && this.realtimeSocket) return;
      this.disconnectRealtime();

      const url = new URL(`${COMMENTS_WS_URL}/${pageKey}`);
      if (token) url.searchParams.set("token", token);

      const ws = new WebSocket(url.toString());
      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data || "{}") as any;
          if (!payload || !payload.type) return;
          if (payload.type === "thread_created" && payload.thread) {
            this.applyThread(payload.thread as CommentThread);
            return;
          }
          if (payload.type === "comment_created") {
            const threadId = payload.thread_id as string;
            const docNodeId = payload.doc_node_id as string;
            const pageIdValue = payload.page_id ?? pageId;
            const comment = payload.comment as CommentItem;
            if (threadId && docNodeId && comment) {
              this.applyComment(pageIdValue, docNodeId, threadId, comment);
            }
            return;
          }
          if (payload.type === "thread_deleted") {
            const threadId = payload.thread_id as string;
            const docNodeId = payload.doc_node_id as string;
            const pageIdValue = payload.page_id ?? pageId;
            if (threadId && docNodeId) {
              this.removeThread(pageIdValue, threadId, docNodeId);
            }
          }
        } catch {
          // ignore
        }
      };
      ws.onclose = () => {
        if (this.realtimeSocket === ws) {
          this.realtimeSocket = null;
          this.realtimePageId = null;
        }
      };
      this.realtimeSocket = ws;
      this.realtimePageId = pageKey;
    },

    disconnectRealtime() {
      if (this.realtimeSocket) {
        try {
          this.realtimeSocket.close();
        } catch {
          // ignore
        }
      }
      this.realtimeSocket = null;
      this.realtimePageId = null;
    },

    setThreadsForNode(key: string, threads: CommentThread[]) {
      const active = threads.filter((t) => !t?.resolved);
      this.threadIdsByNode[key] = active.map((t) => t.id);
      for (const t of active) {
        this.threadsById[t.id] = t;
        if (t.comments) {
          this.commentsByThread[t.id] = t.comments;
        }
      }
    },

    setThreadsForPage(pageId: string | number, threads: CommentThread[]) {
      const byNode: Record<string, string[]> = {};
      const active = threads.filter((t) => !t?.resolved);
      for (const t of active) {
        this.threadsById[t.id] = t;
        if (t.comments) this.commentsByThread[t.id] = t.comments;
        const key = nodeKey(pageId, t.doc_node_id);
        if (!byNode[key]) byNode[key] = [];
        byNode[key].push(t.id);
        this.recomputeNodeCount(pageId, t.doc_node_id);
      }
      Object.entries(byNode).forEach(([k, ids]) => {
        this.threadIdsByNode[k] = ids;
      });
    },

    async fetchThreadsForNode(pageId: string | number, docNodeId: string) {
      const key = nodeKey(pageId, docNodeId);
      this.loadingByNode[key] = true;
      try {
        const res = await api.get(`/pages/${pageId}/comments/threads/`, {
          params: { doc_node_id: docNodeId },
        });
        const threads = (res.data ?? []) as CommentThread[];
        const active = threads.filter((t) => !t?.resolved);
        this.setThreadsForNode(key, active);
        this.recomputeNodeCount(pageId, docNodeId);
        return active;
      } finally {
        this.loadingByNode[key] = false;
      }
    },

    async fetchThreadsForPage(pageId: string | number) {
      const key = String(pageId);
      this.loadingByPage[key] = true;
      try {
        const res = await api.get(`/pages/${pageId}/comments/threads/`);
        const threads = (res.data ?? []) as CommentThread[];
        const active = threads.filter((t) => !t?.resolved);
        this.setThreadsForPage(pageId, active);
        return active;
      } finally {
        this.loadingByPage[key] = false;
      }
    },

    async createThreadWithComment(
      pageId: string | number,
      docNodeId: string,
      body: string,
    ) {
      const res = await api.post(`/pages/${pageId}/comments/threads/`, {
        doc_node_id: docNodeId,
        body,
      });
      const thread = res.data as CommentThread;
      const key = nodeKey(pageId, docNodeId);
      const existing = this.threadIdsByNode[key] ?? [];
      if (!existing.includes(thread.id)) {
        this.threadIdsByNode[key] = [thread.id, ...existing];
      }
      this.threadsById[thread.id] = thread;
      if (thread.comments) this.commentsByThread[thread.id] = thread.comments;
      this.recomputeNodeCount(pageId, docNodeId);
      return thread;
    },

    async fetchComments(pageId: string | number, threadId: string) {
      const res = await api.get(
        `/pages/${pageId}/comments/threads/${threadId}/comments/`,
      );
      const items = (res.data ?? []) as CommentItem[];
      this.commentsByThread[threadId] = items;
      const thread = this.threadsById[threadId];
      if (thread) this.recomputeNodeCount(pageId, thread.doc_node_id);
      return items;
    },

    async addComment(pageId: string | number, threadId: string, body: string) {
      const res = await api.post(
        `/pages/${pageId}/comments/threads/${threadId}/comments/`,
        { body },
      );
      const item = res.data as CommentItem;
      const list = this.commentsByThread[threadId] ?? [];
      const nextId = normalizeId(item?.id);
      if (!list.some((c) => normalizeId(c.id) === nextId)) {
        this.commentsByThread[threadId] = [...list, item];
      }
      const thread = this.threadsById[threadId];
      if (thread) this.recomputeNodeCount(pageId, thread.doc_node_id);
      return item;
    },

    async setResolved(
      pageId: string | number,
      threadId: string,
      resolved: boolean,
    ) {
      const res = await api.patch(
        `/pages/${pageId}/comments/threads/${threadId}/resolve/`,
        { resolved },
      );
      const docNodeId = res.data?.doc_node_id as string | undefined;
      if (docNodeId) {
        this.removeThread(pageId, threadId, docNodeId);
      }
      return res.data;
    },
  },
});
