<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import ActionMenuDB from "@/components/ActionMenuDB.vue";
import useLiveAnchorRect from "@/composables/useLiveAnchorRect";
import { useOverlayBinding } from "@/composables/useOverlayBinding";
import { useAnchorRegistryStore } from "@/stores/anchorRegistry";
import usePagesStore from "@/stores/pages";
import { getIconComponent } from "@/icons/catalog";
import { useUIOverlayStore } from "@/stores/uioverlay";
import { useMenuActionDispatcher } from "@/composables/useMenuActionDispatcher";
import { MENU_COMMANDS } from "@/domain/menuActions";

const props = defineProps<{
  open: boolean;
  anchorKey: string | null;
  placement?: string;
}>();

const uiOverlay = useUIOverlayStore();
const anchorsStore = useAnchorRegistryStore();
const pagesStore = usePagesStore();
const { dispatchMenuAction } = useMenuActionDispatcher();

const menuEl = ref<any>(null);
const loading = ref(false);
let listScrollTimer: number | null = null;

const anchorResolved = computed(() =>
  props.anchorKey ? anchorsStore.getAnchorEl(props.anchorKey) : null,
);

const anyOpen = computed(() => props.open);
const { anchorRect, scheduleUpdate, updateNow } = useLiveAnchorRect(
  anchorResolved,
  anyOpen,
);

const trashedPages = computed(() => pagesStore.trashedPages ?? []);

async function refreshTrash() {
  loading.value = true;
  try {
    await pagesStore.fetchTrashPages();
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.open,
  async (v) => {
    if (!v) return;
    await nextTick();
    updateNow();
    await new Promise(requestAnimationFrame);
    updateNow();
    if (!anchorRect.value) {
      scheduleUpdate();
      await new Promise(requestAnimationFrame);
    }
    await refreshTrash();
    await nextTick();
    await new Promise(requestAnimationFrame);
    menuEl.value?.resetMeasure?.();
  },
  { immediate: true },
);

function close() {
  uiOverlay.requestClose?.("page.trashMenu");
}

async function onRestore(pageId: string | number) {
  const res = await dispatchMenuAction({
    type: "command",
    ctx: { pageId: String(pageId) },
    command: MENU_COMMANDS.PAGE_RESTORE_TRASH,
  });
  if (res?.ok) close();
}

async function onPurge(pageId: string | number) {
  const res = await dispatchMenuAction({
    type: "command",
    ctx: { pageId: String(pageId) },
    command: MENU_COMMANDS.PAGE_PURGE,
  });
  if (res?.ok) close();
}

function onListScroll(e: Event) {
  const el = e.currentTarget as HTMLElement | null;
  if (!el) return;
  el.classList.add("is-scrolling");
  if (listScrollTimer) window.clearTimeout(listScrollTimer);
  listScrollTimer = window.setTimeout(() => {
    el.classList.remove("is-scrolling");
    listScrollTimer = null;
  }, 450);
}

useOverlayBinding({
  id: "trash-menu",
  kind: "dropdown",
  priority: 4,
  behaviour: "stack",

  isOpen: () => props.open,
  getInteractionScope: () => "local",
  getMenuEl: () => menuEl.value?.el?.value ?? null,
  getAnchorEl: () => anchorResolved.value,

  requestClose: close,
  options: {
    closeOnEsc: true,
    closeOnOutside: true,
    stopPointerOutside: true,
    lockScroll: false,
    restoreFocus: true,
    allowAnchorClick: true,
  },
});
</script>

<template>
  <Teleport to="body">
    <ActionMenuDB
      ref="menuEl"
      :open="open"
      :anchorRect="anchorRect"
      :custom="true"
      :placement="placement || 'right-start'"
      :minWidth="320"
      :viewportMargin="12"
      :maxWPost="420"
      :maxHPost="420"
      @close="close"
    >
      <div class="trash-menu">
        <div class="trash-header">
          <div class="trash-title">Trash</div>
        </div>

        <div v-if="loading" class="trash-loading">Loading…</div>

        <div v-else-if="!trashedPages.length" class="trash-empty">
          Trash is empty
        </div>

        <div v-else class="trash-list menu-scroll" @scroll="onListScroll">
          <div
            v-for="page in trashedPages"
            :key="String(page.id)"
            class="trash-row"
          >
            <div class="trash-row-left">
              <span class="trash-icon">
                <component
                  :is="getIconComponent(page.icon || 'lucide:file')"
                  :size="16"
                />
              </span>
              <span class="trash-label">
                {{ page.title || "Untitled" }}
              </span>
            </div>
            <div class="trash-actions">
              <button
                class="trash-btn ghost"
                type="button"
                title="Restore"
                @click="onRestore(page.id)"
              >
                <component
                  :is="getIconComponent('lucide:rotate-ccw')"
                  :size="16"
                />
              </button>
              <button
                class="trash-btn danger"
                type="button"
                title="Delete permanently"
                @click="onPurge(page.id)"
              >
                <component
                  :is="getIconComponent('lucide:trash-2')"
                  :size="16"
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </ActionMenuDB>
  </Teleport>
</template>

<style scoped>
.trash-menu {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  padding-left: 12px;
  padding-right: 0px;
  color: var(--text-main);
}

.trash-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.trash-title {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.trash-loading,
.trash-empty {
  padding: 10px 4px;
  font-size: 13px;
  color: var(--text-secondary);
}

.trash-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: min(320px, calc(100vh - 180px));
  overflow: auto;
}

.trash-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  background: transparent;
  transition:
    background-color 120ms ease,
    color 120ms ease;
}

.trash-row:hover {
  background: var(--bg-hover);
}

.trash-row-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.trash-icon {
  width: 22px;
  display: inline-flex;
  justify-content: center;
  color: var(--icon-secondary);
}

.trash-label {
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.trash-row:hover .trash-label,
.trash-row:hover .trash-icon {
  color: var(--text-main);
}

.trash-actions {
  display: inline-flex;
  gap: 6px;
}

.trash-btn {
  height: 28px;
  width: 28px;
  border-radius: 8px;
  border: 0;
  background: transparent;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  opacity: 0.8;
  transition:
    opacity 120ms ease,
    background-color 120ms ease,
    color 120ms ease;
}

.trash-btn:hover {
  background: var(--bg-icon-hover);
  opacity: 1;
}

.trash-btn.danger:hover {
  color: var(--text-danger);
  background: var(--bg-menu-danger);
}
</style>
