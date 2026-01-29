import useCollaborationStore, { Role } from "@/stores/collaboration";

export function useCollaborationActions() {
  const store = useCollaborationStore();

  function fetchCollaborators(pageId: string | number) {
    return store.fetchCollaborators(pageId);
  }

  function updateCollaboratorRole(
    pageId: string | number,
    userId: string | number,
    role: Role,
  ) {
    return store.updateCollaboratorRole(pageId, userId, role);
  }

  function removeCollaborator(
    pageId: string | number,
    userId: string | number,
  ) {
    return store.removeCollaborator(pageId, userId);
  }

  function fetchInvites(pageId: string | number) {
    return store.fetchInvites(pageId);
  }

  function createInvite(
    pageId: string | number,
    userId: string | number,
    role: Role,
  ) {
    return store.createInvite(pageId, userId, role);
  }

  function cancelInvite(inviteId: string | number, pageId?: string | number) {
    return store.cancelInvite(inviteId, pageId);
  }

  function fetchInboxInvites() {
    return store.fetchInboxInvites();
  }

  function acceptInvite(inviteId: string | number) {
    return store.acceptInvite(inviteId);
  }

  function declineInvite(inviteId: string | number) {
    return store.declineInvite(inviteId);
  }

  function fetchAuditLogs(pageId: string | number) {
    return store.fetchAuditLogs(pageId);
  }

  function searchUsers(query: string) {
    return store.searchUsers(query);
  }

  function compactDoc(pageId: string | number) {
    return store.compactDoc(pageId);
  }

  return {
    fetchCollaborators,
    updateCollaboratorRole,
    removeCollaborator,
    fetchInvites,
    createInvite,
    cancelInvite,
    fetchInboxInvites,
    acceptInvite,
    declineInvite,
    fetchAuditLogs,
    searchUsers,
    compactDoc,
  };
}

export default useCollaborationActions;
