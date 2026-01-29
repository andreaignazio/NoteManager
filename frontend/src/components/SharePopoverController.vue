<script setup>
import { computed, nextTick, ref, unref, watch } from "vue";
import ActionMenuDB from "@/components/ActionMenuDB.vue";
import useLiveAnchorRect from "@/composables/useLiveAnchorRect";
import { useOverlayLayer } from "@/composables/useOverlayLayer";
import { useAnchorRegistryStore } from "@/stores/anchorRegistry";
import usePagesStore from "@/stores/pages";
import useCollaborationStore from "@/stores/collaboration";
import { useUiStore } from "@/stores/ui";
import { useCollaborationActions } from "@/actions/collaboration.actions";
import { usePageActions } from "@/actions/pages.actions";

const props = defineProps({
  pageId: { type: [String, Number], default: null },
  anchorEl: { type: [Object, null], default: null },
  anchorKey: { type: [String, Number], default: null },
  placement: { type: String, default: "bottom-end" },
  minWidth: { type: Number, default: 420 },
  gap: { type: Number, default: 8 },
  lockScrollOnOpen: { type: Boolean, default: false },
  anchorLocation: { type: String, default: "" },
  scope: { type: String, default: "tree" },
});

const emit = defineEmits(["close"]);

const pagesStore = usePagesStore();
const collabStore = useCollaborationStore();
const ui = useUiStore();
const actions = useCollaborationActions();
const pageActions = usePageActions();
const anchorsStore = useAnchorRegistryStore();

const menuOpen = ref(false);
const activeTab = ref("collaborators");

const searchQuery = ref("");
const searchResults = ref([]);
const inviteRole = ref("editor");
const searchLoading = ref(false);
const errorMsg = ref("");
const compacting = ref(false);

const anchorResolved = computed(() => {
  if (props.anchorKey) return anchorsStore.getAnchorEl(props.anchorKey);
  return unref(props.anchorEl) ?? null;
});

const { anchorRect, scheduleUpdate } = useLiveAnchorRect(
  anchorResolved,
  menuOpen,
);

const menuRef = ref(null);
const layerId = computed(() =>
  props.pageId
    ? `${props.anchorLocation}:page-share:${props.pageId}:${props.scope}`
    : null,
);

const { syncOpen } = useOverlayLayer(layerId, () => ({
  getMenuEl: () => menuRef.value?.getMenuEl?.() ?? null,
  getAnchorEl: () => anchorResolved.value,
  close: () => close(),
  options: {
    closeOnEsc: true,
    closeOnOutside: true,
    stopPointerOutside: true,
    lockScroll: !!props.lockScrollOnOpen,
    restoreFocus: true,
    allowAnchorClick: true,
  },
}));

syncOpen(computed(() => !!layerId.value && menuOpen.value));

const page = computed(() => {
  const id = props.pageId != null ? String(props.pageId) : null;
  if (!id) return null;
  return pagesStore.pagesById?.[id] ?? null;
});

const role = computed(() => {
  const r = page.value?.role ?? null;
  return r;
});

const canInvite = computed(
  () => role.value === "owner" || role.value === "editor",
);
const canManageRoles = computed(() => role.value === "owner");

const collaborators = computed(() => {
  if (!props.pageId) return [];
  return collabStore.collaboratorsByPage[String(props.pageId)] ?? [];
});

const invites = computed(() => {
  if (!props.pageId) return [];
  return collabStore.invitesByPage[String(props.pageId)] ?? [];
});

const onlineUserIds = computed(() => {
  if (!props.pageId) return new Set();
  const ids = collabStore.onlineUserIdsByPage[String(props.pageId)] ?? [];
  return new Set(ids.map((id) => String(id)));
});

const onlineCount = computed(() => onlineUserIds.value.size);

const auditLogs = computed(() => {
  if (!props.pageId) return [];
  return collabStore.auditByPage[String(props.pageId)] ?? [];
});

const inboxInvites = computed(() => collabStore.inboxInvites ?? []);

const collaboratorUserIds = computed(
  () => new Set(collaborators.value.map((c) => String(c.user.id))),
);

function isUserOnline(userId) {
  return onlineUserIds.value.has(String(userId));
}

async function refresh() {
  if (!props.pageId) return;
  errorMsg.value = "";
  try {
    await actions.fetchCollaborators(props.pageId);
    if (canInvite.value) {
      await actions.fetchInvites(props.pageId);
    }
    if (role.value === "owner" || role.value === "editor") {
      await actions.fetchAuditLogs(props.pageId);
    }
    await actions.fetchInboxInvites();
  } catch (e) {
    errorMsg.value = e?.message ?? "Failed to load";
  }
}

async function open() {
  if (!props.pageId) return;
  menuOpen.value = true;
  await nextTick();
  scheduleUpdate();
  await refresh();
}

function close() {
  menuOpen.value = false;
  emit("close");
}

defineExpose({ open, close });

let searchTimer = null;
watch(searchQuery, (q) => {
  if (searchTimer) window.clearTimeout(searchTimer);
  if (!q.trim()) {
    searchResults.value = [];
    return;
  }
  searchTimer = window.setTimeout(async () => {
    searchLoading.value = true;
    try {
      const results = await actions.searchUsers(q);
      searchResults.value = results;
    } finally {
      searchLoading.value = false;
    }
  }, 250);
});

async function inviteUser(user) {
  if (!props.pageId) return;
  if (!canInvite.value) return;
  if (collaboratorUserIds.value.has(String(user.id))) return;
  await actions.createInvite(props.pageId, user.id, inviteRole.value);
  searchQuery.value = "";
  searchResults.value = [];
}

async function updateRole(userId, nextRole) {
  if (!props.pageId) return;
  if (!canManageRoles.value) return;
  await actions.updateCollaboratorRole(props.pageId, userId, nextRole);
}

async function removeUser(userId) {
  if (!props.pageId) return;
  if (!canManageRoles.value) return;
  await actions.removeCollaborator(props.pageId, userId);
}

async function cancelInvite(inviteId) {
  if (!props.pageId) return;
  await actions.cancelInvite(inviteId, props.pageId);
}

async function acceptInvite(inviteId) {
  const invite = await actions.acceptInvite(inviteId);
  if (ui.sidebarMode === "hidden") {
    ui.setSidebarMode("docked");
  }
  await pagesStore.fetchPages();
  const pageId = invite?.page != null ? String(invite.page) : null;

  if (pageId && pagesStore.pagesById?.[pageId]) {
    pagesStore.ensureVisible(pageId);
    ui.requestScrollToPage(pageId);
    ui.setLastAddedPageId(pageId);
  }

  if (pageId) {
    close();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        pageActions.simpleRedirectToPage(pageId);
      });
    });
  }
  await refresh();
}

async function declineInvite(inviteId) {
  await actions.declineInvite(inviteId);
  await refresh();
}

async function compactDoc() {
  if (!props.pageId) return;
  if (!canManageRoles.value) return;
  compacting.value = true;
  try {
    await actions.compactDoc(props.pageId);
  } finally {
    compacting.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <ActionMenuDB
      ref="menuRef"
      :open="menuOpen"
      :anchorRect="anchorRect"
      :anchorEl="anchorResolved"
      :placement="placement"
      :minWidth="minWidth"
      :gap="gap"
      :custom="true"
      :scroll="false"
      @close="close"
    >
      <div class="share-panel">
        <header class="share-header">
          <div class="title">Share</div>
          <div class="tabs">
            <button
              type="button"
              :class="{ active: activeTab === 'collaborators' }"
              @click="activeTab = 'collaborators'"
            >
              Collaborators
            </button>
            <button
              type="button"
              :class="{ active: activeTab === 'inbox' }"
              @click="activeTab = 'inbox'"
            >
              Inbox
              <span v-if="inboxInvites.length" class="badge">{{
                inboxInvites.length
              }}</span>
            </button>
          </div>
        </header>

        <div v-if="errorMsg" class="error">{{ errorMsg }}</div>

        <div v-if="activeTab === 'collaborators'" class="section">
          <div class="toolbar">
            <div class="presence-pill" :class="{ live: onlineCount > 1 }">
              <span
                class="presence-dot"
                :class="{ live: onlineCount > 1, idle: onlineCount <= 1 }"
                aria-hidden="true"
              ></span>
              <span>Online: {{ onlineCount }}</span>
            </div>
            <button
              class="btn"
              type="button"
              :disabled="!canManageRoles || compacting"
              @click="compactDoc"
            >
              {{ compacting ? "Compacting…" : "Compact history" }}
            </button>
          </div>
          <div class="invite-row">
            <input
              v-model="searchQuery"
              class="search"
              type="text"
              :placeholder="
                canInvite
                  ? 'Invite by username or name'
                  : 'You do not have permission to invite'
              "
              :disabled="!canInvite"
            />
            <select
              v-model="inviteRole"
              class="role-select"
              :disabled="!canInvite"
            >
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
              <option value="owner">Owner</option>
            </select>
          </div>

          <div v-if="searchLoading" class="muted">Searching…</div>
          <ul v-if="searchResults.length" class="results">
            <li v-for="u in searchResults" :key="u.id" class="result-item">
              <div class="user">
                <div class="name">{{ u.username }}</div>
                <div class="sub">
                  {{ [u.first_name, u.last_name].filter(Boolean).join(" ") }}
                </div>
              </div>
              <button
                class="btn"
                type="button"
                :disabled="!canInvite || collaboratorUserIds.has(String(u.id))"
                @click="inviteUser(u)"
              >
                Invite
              </button>
            </li>
          </ul>

          <div class="section-title">Collaborators</div>
          <ul class="list">
            <li v-for="c in collaborators" :key="c.id" class="list-item">
              <div class="user">
                <div class="name">{{ c.user.username }}</div>
                <div class="sub">
                  {{
                    [c.user.first_name, c.user.last_name]
                      .filter(Boolean)
                      .join(" ")
                  }}
                </div>
              </div>
              <div
                class="status-pill"
                :class="{ online: isUserOnline(c.user.id) }"
              >
                <span
                  class="status-dot"
                  :class="{ online: isUserOnline(c.user.id) }"
                  aria-hidden="true"
                ></span>
                {{ isUserOnline(c.user.id) ? "Online" : "Offline" }}
              </div>
              <select
                class="role-select"
                :disabled="!canManageRoles || c.role === 'owner'"
                :value="c.role"
                @change="updateRole(String(c.user.id), $event.target.value)"
              >
                <option value="owner">Owner</option>
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
              <button
                class="btn-danger"
                type="button"
                :disabled="!canManageRoles || c.role === 'owner'"
                @click="removeUser(String(c.user.id))"
              >
                Remove
              </button>
            </li>
          </ul>

          <div v-if="invites.length" class="section-title">Pending Invites</div>
          <ul v-if="invites.length" class="list">
            <li v-for="i in invites" :key="i.id" class="list-item">
              <div class="user">
                <div class="name">{{ i.invitee.username }}</div>
                <div class="sub">Role: {{ i.role }}</div>
              </div>
              <div class="status">{{ i.status }}</div>
              <button
                class="btn"
                type="button"
                :disabled="!canInvite || i.status !== 'pending'"
                @click="cancelInvite(i.id)"
              >
                Cancel
              </button>
            </li>
          </ul>

          <div v-if="auditLogs.length" class="section-title">Audit log</div>
          <ul v-if="auditLogs.length" class="list">
            <li v-for="log in auditLogs" :key="log.id" class="list-item">
              <div class="user">
                <div class="name">
                  {{ log.actor?.username || "System" }} →
                  {{ log.target_user?.username || "N/A" }}
                </div>
                <div class="sub">
                  {{ log.action }}
                  <span v-if="log.role_before || log.role_after">
                    ({{ log.role_before || "none" }} →
                    {{ log.role_after || "none" }})
                  </span>
                </div>
              </div>
              <div class="status">{{ log.created_at }}</div>
            </li>
          </ul>
        </div>

        <div v-else class="section">
          <div v-if="!inboxInvites.length" class="muted">No invites.</div>
          <ul v-else class="list">
            <li v-for="i in inboxInvites" :key="i.id" class="list-item">
              <div class="user">
                <div class="name">{{ i.page_title || i.page }}</div>
                <div class="sub">
                  Invited by {{ i.inviter.username }} as {{ i.role }}
                </div>
              </div>
              <div class="actions">
                <button class="btn" type="button" @click="acceptInvite(i.id)">
                  Accept
                </button>
                <button
                  class="btn-danger"
                  type="button"
                  @click="declineInvite(i.id)"
                >
                  Decline
                </button>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </ActionMenuDB>
  </Teleport>
</template>

<style scoped>
.share-panel {
  min-width: 420px;
  padding: 12px;
  display: grid;
  gap: 12px;
  color: var(--text-main);
}

.share-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.title {
  font-weight: 600;
  font-size: 14px;
}

.tabs {
  display: flex;
  gap: 6px;
}

.tabs button {
  border: 1px solid var(--border-menu);
  background: var(--bg-icon-transp);
  color: var(--text-main);
  padding: 6px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 12px;
}

.tabs button.active {
  background: var(--bg-menu);
  border-color: var(--border-menu-strong, var(--border-menu));
}

.badge {
  margin-left: 6px;
  background: var(--bg-badge, #e11d48);
  color: white;
  border-radius: 999px;
  padding: 2px 6px;
  font-size: 10px;
}

.section {
  display: grid;
  gap: 10px;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
}

.invite-row {
  height: 36px;
  display: flex;
  /*grid-template-columns: minmax(0, 1fr) auto;*/
  align-items: center;
  gap: 8px;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.search {
  position: relative;
  width: 100%;
  height: 18px;
  min-width: 0;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--border-menu);
  background: var(--bg-input, var(--bg-menu));
  color: var(--text-main);
}

.role-select {
  height: 36px;
  position: relative;
  min-width: 110px;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid var(--border-menu);
  background: var(--bg-input, var(--bg-menu));
  color: var(--text-main);
}

.results,
.list {
  display: grid;
  gap: 8px;
}

.result-item,
.list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.user {
  display: grid;
  gap: 2px;
}

.name {
  font-size: 13px;
  font-weight: 500;
}

.sub {
  font-size: 11px;
  color: var(--text-muted);
}

.btn,
.btn-danger {
  border: 1px solid var(--border-menu);
  background: var(--bg-icon-transp);
  color: var(--text-main);
  padding: 6px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 12px;
}

.btn-danger {
  border-color: #f43f5e;
  color: #f43f5e;
}

.muted {
  font-size: 12px;
  color: var(--text-muted);
}

.error {
  font-size: 12px;
  color: #ef4444;
}

.actions {
  display: flex;
  gap: 6px;
}

.status {
  font-size: 12px;
  color: var(--text-muted);
}

.presence-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid var(--border-menu);
  background: var(--bg-icon-transp);
  font-size: 11px;
  color: var(--text-muted);
}

.presence-pill.live {
  color: #10b981;
  border-color: rgba(16, 185, 129, 0.4);
}

.presence-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #94a3b8;
}

.presence-dot.live {
  background: #22c55e;
  box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.2);
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 11px;
  border: 1px solid var(--border-menu);
  color: var(--text-muted);
  background: var(--bg-icon-transp);
}

.status-pill.online {
  color: #10b981;
  border-color: rgba(16, 185, 129, 0.4);
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #94a3b8;
}

.status-dot.online {
  background: #22c55e;
  box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.2);
}
</style>
