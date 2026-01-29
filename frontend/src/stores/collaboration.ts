import { defineStore } from "pinia";
import api from "@/services/api";

export type Role = "owner" | "editor" | "viewer";

export type UserSummary = {
  id: string;
  username: string;
  first_name?: string;
  last_name?: string;
  email?: string;
};

export type Collaborator = {
  id: string;
  page: string;
  user: UserSummary;
  role: Role;
  created_at?: string;
  updated_at?: string;
};

export type Invite = {
  id: string;
  page: string;
  page_title?: string | null;
  inviter: UserSummary;
  invitee: UserSummary;
  role: Role;
  status: "pending" | "accepted" | "declined" | "cancelled" | "expired";
  created_at?: string;
  updated_at?: string;
  responded_at?: string | null;
  expires_at?: string | null;
};

export type AuditLog = {
  id: string;
  page: string;
  actor: UserSummary | null;
  target_user: UserSummary | null;
  action: string;
  role_before?: Role | null;
  role_after?: Role | null;
  meta?: Record<string, any>;
  created_at?: string;
};

interface CollaborationState {
  collaboratorsByPage: Record<string, Collaborator[]>;
  invitesByPage: Record<string, Invite[]>;
  auditByPage: Record<string, AuditLog[]>;
  inboxInvites: Invite[];
  isLoadingByPage: Record<string, boolean>;
  errorByPage: Record<string, any>;
  presenceByPage: Record<string, { count: number; users: UserSummary[] }>;
  onlineUserIdsByPage: Record<string, string[]>;
}

export const useCollaborationStore = defineStore("collaborationStore", {
  state: (): CollaborationState => ({
    collaboratorsByPage: {},
    invitesByPage: {},
    auditByPage: {},
    inboxInvites: [],
    isLoadingByPage: {},
    errorByPage: {},
    presenceByPage: {},
    onlineUserIdsByPage: {},
  }),

  actions: {
    async fetchCollaborators(pageId: string | number) {
      const id = String(pageId);
      this.isLoadingByPage[id] = true;
      this.errorByPage[id] = null;
      try {
        const res = await api.get(`/pages/${id}/collaborators/`);
        this.collaboratorsByPage[id] = res.data as Collaborator[];
        return this.collaboratorsByPage[id];
      } catch (error) {
        this.errorByPage[id] = error;
        throw error;
      } finally {
        this.isLoadingByPage[id] = false;
      }
    },

    async updateCollaboratorRole(
      pageId: string | number,
      userId: string | number,
      role: Role,
    ) {
      const id = String(pageId);
      const res = await api.patch(`/pages/${id}/collaborators/`, {
        user_id: String(userId),
        role,
      });
      const updated = res.data as Collaborator;
      const list = this.collaboratorsByPage[id] ?? [];
      this.collaboratorsByPage[id] = list.map((c) =>
        c.user.id === updated.user.id ? updated : c,
      );
      return updated;
    },

    async removeCollaborator(pageId: string | number, userId: string | number) {
      const id = String(pageId);
      await api.delete(`/pages/${id}/collaborators/${userId}/`);
      const list = this.collaboratorsByPage[id] ?? [];
      this.collaboratorsByPage[id] = list.filter(
        (c) => String(c.user.id) !== String(userId),
      );
    },

    async fetchInvites(pageId: string | number) {
      const id = String(pageId);
      const res = await api.get(`/invites/?page=${id}`);
      this.invitesByPage[id] = res.data as Invite[];
      return this.invitesByPage[id];
    },

    async createInvite(
      pageId: string | number,
      userId: string | number,
      role: Role,
    ) {
      const res = await api.post(`/invites/`, {
        page_id: String(pageId),
        user_id: String(userId),
        role,
      });
      const invite = res.data as Invite;
      const id = String(pageId);
      const list = this.invitesByPage[id] ?? [];
      const exists = list.find((i) => i.id === invite.id);
      this.invitesByPage[id] = exists
        ? list.map((i) => (i.id === invite.id ? invite : i))
        : [invite, ...list];
      return invite;
    },

    async cancelInvite(inviteId: string | number, pageId?: string | number) {
      const res = await api.post(`/invites/${inviteId}/cancel/`);
      const invite = res.data as Invite;
      if (pageId) {
        const id = String(pageId);
        const list = this.invitesByPage[id] ?? [];
        this.invitesByPage[id] = list.map((i) =>
          i.id === invite.id ? invite : i,
        );
      }
      return invite;
    },

    async fetchInboxInvites() {
      const res = await api.get(`/invites/inbox/`);
      this.inboxInvites = res.data as Invite[];
      return this.inboxInvites;
    },

    async acceptInvite(inviteId: string | number) {
      const res = await api.post(`/invites/${inviteId}/accept/`);
      const invite = res.data as Invite;
      this.inboxInvites = this.inboxInvites.filter((i) => i.id !== invite.id);
      return invite;
    },

    async declineInvite(inviteId: string | number) {
      const res = await api.post(`/invites/${inviteId}/decline/`);
      const invite = res.data as Invite;
      this.inboxInvites = this.inboxInvites.filter((i) => i.id !== invite.id);
      return invite;
    },

    async fetchAuditLogs(pageId: string | number) {
      const id = String(pageId);
      const res = await api.get(`/audit-logs/?page=${id}`);
      this.auditByPage[id] = res.data as AuditLog[];
      return this.auditByPage[id];
    },

    async searchUsers(query: string) {
      const q = query.trim();
      if (!q) return [] as UserSummary[];
      const res = await api.get(`/users/?q=${encodeURIComponent(q)}`);
      return res.data as UserSummary[];
    },

    async compactDoc(pageId: string | number) {
      const id = String(pageId);
      const res = await api.post(`/pages/${id}/doc/compact/`);
      return res.data as { compacted: boolean };
    },

    setPresence(pageId: string | number, users: UserSummary[]) {
      const id = String(pageId);
      const uniqueUsers = Array.from(
        new Map(users.map((u) => [String(u.id ?? u.username), u])).values(),
      );
      this.presenceByPage[id] = {
        count: uniqueUsers.length,
        users: uniqueUsers,
      };
      this.onlineUserIdsByPage[id] = uniqueUsers.map((u) =>
        String(u.id ?? u.username),
      );
    },
  },
});

export default useCollaborationStore;
