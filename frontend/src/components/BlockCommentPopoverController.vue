<script setup lang="ts">
import { computed, nextTick, ref, unref, watch } from "vue";
import useLiveAnchorRect from "@/composables/useLiveAnchorRect";
import { useOverlayLayer } from "@/composables/useOverlayLayer";
import ActionMenuDB from "@/components/ActionMenuDB.vue";
import {
  useAnchorRegistryStore,
  type AnchorLike,
} from "@/stores/anchorRegistry";
import { useCommentsStore } from "@/stores/comments";
import useAuthStore from "@/stores/auth";

const props = defineProps({
  pageId: { type: [String, Number], default: null },
  docNodeId: { type: [String, Number], default: null },
  anchorEl: { type: [Object, null], default: null },
  anchorKey: { type: String, default: null },
  placement: { type: String, default: "right-start" },
  lockScrollOnOpen: { type: Boolean, default: false },
  anchorLocation: { type: String, default: "blockRow" },
  canComment: { type: Boolean, default: false },
  canResolve: { type: Boolean, default: false },
  cleanup: { type: Function, default: null },
});

const emit = defineEmits(["close"]);

const anchorsStore = useAnchorRegistryStore();
const commentsStore = useCommentsStore();
const authStore = useAuthStore();

const rectTriggerOpen = ref(false);
const menuOpen = ref(false);
const anyOpen = computed(() => menuOpen.value || rectTriggerOpen.value);

const anchorResolved = computed<AnchorLike | null>(() => {
  if (props.anchorKey)
    return (anchorsStore.getAnchorEl(props.anchorKey) as AnchorLike) ?? null;
  return (unref(props.anchorEl) as AnchorLike | null) ?? null;
});

const { anchorRect, scheduleUpdate, updateNow } = useLiveAnchorRect(
  anchorResolved,
  anyOpen,
);

const menuRef = ref<any>(null);
const activeMenuEl = computed(() =>
  menuOpen.value ? (menuRef.value?.el?.value ?? null) : null,
);

const layerId = computed(() => {
  if (props.docNodeId)
    return `${props.anchorLocation}:comment:${props.docNodeId}`;
  return null;
});

const inputText = ref("");
const isBusy = ref(false);
const activeThreadId = ref<string | null>(null);
const listRef = ref<HTMLElement | null>(null);

const threads = computed(() => {
  if (!props.pageId || !props.docNodeId) return [];
  const key = `${props.pageId}:${props.docNodeId}`;
  const ids = commentsStore.threadIdsByNode[key] ?? [];
  return ids.map((id) => commentsStore.threadsById[id]).filter(Boolean);
});

const comments = computed(() => {
  const id = activeThreadId.value;
  if (!id) return [];
  return commentsStore.commentsByThread[id] ?? [];
});

const activeThread = computed(() => {
  const id = activeThreadId.value;
  return id ? (commentsStore.threadsById[id] ?? null) : null;
});

const currentUser = computed(() => authStore.user);

const userInitial = computed(() => {
  const u = currentUser.value;
  const name = (u?.first_name || u?.username || "?").trim();
  return name ? name[0].toUpperCase() : "?";
});

async function ensureThreadsLoaded() {
  if (!props.pageId || !props.docNodeId) return;
  const list = await commentsStore.fetchThreadsForNode(
    String(props.pageId),
    String(props.docNodeId),
  );
  if (!activeThreadId.value && list.length) {
    activeThreadId.value = list[0].id;
  }
  if (activeThreadId.value) {
    await commentsStore.fetchComments(
      String(props.pageId),
      activeThreadId.value,
    );
  }
}

async function open() {
  if (!props.pageId || !props.docNodeId) return;
  rectTriggerOpen.value = true;
  await nextTick();
  updateNow();
  await new Promise(requestAnimationFrame);
  updateNow();

  menuOpen.value = true;
  rectTriggerOpen.value = false;
  nextTick(() => scheduleUpdate());

  await ensureThreadsLoaded();
}

function close() {
  menuOpen.value = false;
  rectTriggerOpen.value = false;
  props.cleanup?.();
  emit("close");
}

async function submitComment() {
  if (!props.pageId || !props.docNodeId) return;
  const body = inputText.value.trim();
  if (!body || isBusy.value) return;

  isBusy.value = true;
  try {
    if (!activeThreadId.value) {
      const thread = await commentsStore.createThreadWithComment(
        String(props.pageId),
        String(props.docNodeId),
        body,
      );
      activeThreadId.value = thread.id;
      await commentsStore.fetchComments(String(props.pageId), thread.id);
    } else {
      await commentsStore.addComment(
        String(props.pageId),
        activeThreadId.value,
        body,
      );
    }
    inputText.value = "";
  } finally {
    isBusy.value = false;
  }
}

async function resolveThread() {
  if (!props.pageId || !activeThreadId.value || !activeThread.value) return;
  console.log("resolveThread", activeThreadId.value);
  await commentsStore.setResolved(
    String(props.pageId),
    activeThreadId.value,
    true,
  );
  activeThreadId.value = null;
  inputText.value = "";
  close();
}

watch(
  () => props.docNodeId,
  () => {
    activeThreadId.value = null;
    inputText.value = "";
  },
);

watch(
  () => comments.value.length,
  async () => {
    if (!listRef.value) return;
    await nextTick();
    if (!listRef.value) return;
    listRef.value.scrollTop = listRef.value.scrollHeight;
    scheduleUpdate();
  },
);

defineExpose({ open, close });

useOverlayLayer(layerId, () => ({
  getMenuEl: () => activeMenuEl.value,
  getAnchorEl: () => anchorResolved.value,
  close,
  options: {
    closeOnEsc: true,
    closeOnOutside: true,
    stopPointerOutside: true,
    lockScroll: !!props.lockScrollOnOpen,
    restoreFocus: true,
    allowAnchorClick: true,
  },
})).syncOpen(computed(() => !!layerId.value && anyOpen.value));
</script>

<template>
  <Teleport to="body">
    <ActionMenuDB
      ref="menuRef"
      :open="menuOpen"
      :anchorRect="anchorRect"
      :anchorEl="anchorEl"
      :placement="placement"
      :custom="true"
      :minWidth="360"
      :maxWPost="420"
      :closeOnAction="false"
      @close="close"
    >
      <div class="comment-card">
        <div class="comment-header">
          <div class="title">Commenti</div>
          <button
            v-if="activeThread && canResolve"
            class="resolve-btn"
            type="button"
            @click="resolveThread"
          >
            Resolve
          </button>
        </div>

        <div ref="listRef" class="comment-list">
          <div v-if="!comments.length" class="comment-empty">
            Nessun commento
          </div>
          <div v-for="c in comments" :key="c.id" class="comment-item">
            <div class="avatar">
              {{
                (c.author?.first_name || c.author?.username || "?")
                  .slice(0, 1)
                  .toUpperCase()
              }}
            </div>
            <div class="bubble">
              <div class="meta">
                <span class="name">{{
                  c.author?.first_name || c.author?.username || "Anon"
                }}</span>
                <span class="time">{{
                  new Date(c.created_at).toLocaleString()
                }}</span>
              </div>
              <div class="text">{{ c.body }}</div>
            </div>
          </div>
        </div>

        <div class="comment-input" :class="{ disabled: !canComment }">
          <div class="avatar muted">{{ userInitial }}</div>
          <input
            v-model="inputText"
            class="input"
            type="text"
            placeholder="Add a comment…"
            :disabled="!canComment"
            @keydown.enter.prevent="submitComment"
          />
          <div class="input-actions">
            <button class="icon-btn" type="button" :disabled="!canComment">
              @
            </button>
            <button
              class="send-btn"
              type="button"
              :disabled="!canComment || !inputText.trim() || isBusy"
              @click="submitComment"
            >
              ➤
            </button>
          </div>
        </div>
      </div>
    </ActionMenuDB>
  </Teleport>
</template>

<style scoped>
.comment-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 8px;
  min-width: 340px;
  overflow: hidden;
  max-height: 360px;
}

.comment-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 4px 6px 2px;
}

.comment-header .title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
}

.resolve-btn {
  border: 0;
  background: var(--bg-icon-transp);
  color: var(--text-main);
  border-radius: 8px;
  padding: 4px 8px;
  font-size: 12px;
  cursor: pointer;
}

.resolve-btn:hover {
  background: var(--bg-icon-hover);
}

.resolved-pill {
  font-size: 11px;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.08);
  padding: 4px 8px;
  border-radius: 999px;
}

.comment-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 220px;
  overflow: auto;
  padding: 4px 2px;
}

.comment-empty {
  font-size: 12px;
  color: var(--text-secondary);
  padding: 6px 8px;
}

.comment-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.avatar {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--bg-icon-transp);
  color: var(--text-main);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  flex: 0 0 auto;
}

.avatar.muted {
  background: var(--bg-hover);
  color: var(--text-secondary);
}

.bubble {
  background: var(--bg-hover);
  border: 1px solid var(--border-main);
  border-radius: 10px;
  padding: 8px 10px;
  color: var(--text-main);
  flex: 1;
}

.meta {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.meta .name {
  color: var(--text-main);
  font-weight: 600;
}

.text {
  font-size: 13px;
  line-height: 1.4;
}

.comment-input {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--border-main);
  border-radius: 12px;
  padding: 6px;
  background: var(--bg-hover);
}

.comment-input.disabled {
  opacity: 0.6;
}

.input {
  flex: 1;
  border: none;
  background: transparent;
  color: var(--text-main);
  font-size: 13px;
  outline: none;
}

.input-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.icon-btn {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
}

.icon-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.send-btn {
  border: none;
  background: var(--bg-icon-transp);
  color: var(--text-main);
  border-radius: 8px;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
