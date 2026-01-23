<script setup>
import { computed, nextTick, onBeforeUnmount, ref, unref, watch } from "vue";
import router from "@/router";
import usePagesStore from "@/stores/pages";
import useLiveAnchorRect from "@/composables/useLiveAnchorRect";
import { useTempAnchors } from "@/actions/tempAnchors.actions";
import ActionMenuDB from "@/components/ActionMenuDB.vue";

import { getIconComponent } from "@/icons/catalog";
import { useUIOverlayStore } from "@/stores/uioverlay";
import { useAnchorRegistryStore } from "@/stores/anchorRegistry";
import { useAppActions } from "@/actions/useAppActions";
import { useOverlayBindingKeyed } from "@/composables/useOverlayBindingKeyed";
const tempAnchors = useTempAnchors();

const props = defineProps({
  pageId: { type: [String, Number], default: null },
  anchorEl: { type: [Object, null], default: null }, // HTMLElement | ref
  anchorKey: { type: [String, Number], default: null },
  // anchor registry key
  placement: { type: String, default: "bottom-end" },
  minWidthDelete: { type: Number, default: 320 },
  lockScrollOnOpen: { type: Boolean, default: false },
  anchorLocation: { type: String, default: "" },
  scope: { type: String, default: "tree" },
});

const emit = defineEmits(["rename", "deleted", "duplicated", "moved", "close"]);

const pagesStore = usePagesStore();
const uiOverlay = useUIOverlayStore();
const anchorsStore = useAnchorRegistryStore();
const actions = useAppActions();
// open states
const rectTriggerOpen = ref(false);
const menuOpen = ref(false);
const moveOpen = ref(false);
const delOpen = ref(false);
const keepChildren = ref(true);

const anyOpen = computed(
  () =>
    menuOpen.value || moveOpen.value || delOpen.value || rectTriggerOpen.value,
);

// anchor rect live (wrapper responsibility)
//const anchorResolved = computed(() => unref(props.anchorEl) ?? null)
const anchorResolved = computed(() => {
  if (props.anchorKey) return anchorsStore.getAnchorEl(props.anchorKey);
  return unref(props.anchorEl) ?? null;
});
const { anchorRect, scheduleUpdate, updateNow } = useLiveAnchorRect(
  anchorResolved,
  anyOpen,
);

async function open() {
  if (!props.pageId) return;

  // 1) attiva solo il calcolo del rect (menu ancora chiuso)
  rectTriggerOpen.value = true;
  await nextTick();
  updateNow();

  // 2) aspetta un frame per stabilizzare layout/scroll
  await new Promise(requestAnimationFrame);
  updateNow();

  // se ancora null, prova un ultimo giro (opzionale ma utile)
  if (!anchorRect.value) {
    scheduleUpdate();
    await new Promise(requestAnimationFrame);
  }

  // 3) ora apri il menu (rect dovrebbe essere pronto)
  menuOpen.value = true;
  rectTriggerOpen.value = false;
}

function close() {
  rectTriggerOpen.value = false;
  menuOpen.value = false;
  moveOpen.value = false;
  delOpen.value = false;
  emit("close");
}
function toggle() {
  anyOpen.value ? close() : open();
}

defineExpose({ open, close, toggle });

watch(anyOpen, (v) => {
  if (!v) return;
  console.log("[PageActions] anchorResolved on open:", anchorResolved.value);
});

//DOM Refs
const mainMenuRef = ref(null);
const moveMenuRef = ref(null);
const delMenuRef = ref(null);

const activeMenuEl = computed(() => {
  if (delOpen.value) return delMenuRef.value?.el?.value ?? null;
  if (moveOpen.value) return moveMenuRef.value?.el?.value ?? null;
  if (menuOpen.value) return mainMenuRef.value?.el?.value ?? null;
  return null;
});

//====OVERLAY LAYER STACK====

const overlayId = "global:page-actions";

const identityKey = computed(() => {
  if (!props.pageId) return null;
  return `${props.anchorLocation}:page-actions:${props.pageId}:${props.scope}`;
});

useOverlayBindingKeyed(() => {
  if (!identityKey.value) return null;

  return {
    id: overlayId,
    kind: "dropdown",
    priority: 2,
    behaviour: "stack",
    identityKey: identityKey.value,

    // LIVE SOURCE OF TRUTH
    isOpen: () => anyOpen.value,

    // LIVE fields
    getInteractionScope: () => "local",
    getMenuEl: () => activeMenuEl.value,
    getAnchorEl: () => anchorResolved.value,

    requestClose: close, // chiude main/move/del
    options: {
      closeOnEsc: true,
      closeOnOutside: true,
      stopPointerOutside: true,
      lockScroll: !!props.lockScrollOnOpen,
      restoreFocus: true,
      allowAnchorClick: true,
    },
  };
});

function closeMainOnly() {
  menuOpen.value = false;
}

function openDeletePopover() {
  if (!props.pageId) return;
  keepChildren.value = hasChildren.value;
  delOpen.value = true;
  nextTick(() => scheduleUpdate());
}

const menuItems = computed(() => [
  { type: "item", id: "rename", label: "Rename", iconId: "lucide:edit-3" },
  { type: "item", id: "duplicate", label: "Duplicate", iconId: "lucide:copy" },
  { type: "separator" },
  {
    type: "item",
    id: "move",
    label: "Move to…",
    iconId: "lucide:folder-input",
  },
  {
    type: "item",
    id: "share",
    label: "Share…",
    iconId: "lucide:link",
    disabled: true,
  },
  { type: "separator" },
  {
    type: "item",
    id: "delete",
    label: "Delete",
    iconId: "lucide:trash-2",
    danger: true,
  },
]);

const hasChildren = computed(() => {
  try {
    const id = props.pageId;
    if (!id) return false;
    return (
      pagesStore.hasChildren?.(id) ??
      (pagesStore.childrenByParentId?.[String(id)] ?? []).length > 0
    );
  } catch (e) {
    console.error("[PageActions] hasChildren failed", e);
    return false;
  }
});

// handlers
async function onMenuAction({ id }) {
  console.group("[PageActions] menu action:", id);
  try {
    if (!props.pageId) {
      close();
      return;
    }

    if (id === "rename") {
      close();
      uiOverlay.requestOpen({
        menuId: "page.titlePopover",
        anchorKey: props.anchorKey,
        payload: {
          pageId: props.pageId,
        },
      });

      return;
    }

    if (id === "duplicate") {
      close();
      await actions.pages.duplicatePage(props.pageId);
      return;
    }

    if (id === "move") {
      const tmpanchor = tempAnchors.registerViewportCenter();

      uiOverlay.requestOpen({
        menuId: "page.moveTo",
        anchorKey: tmpanchor.key,
        payload: {
          pageId: props.pageId,
          placement: "center",
        },
      });
      return;
    }

    if (id === "delete") {
      const tmpanchor = tempAnchors.registerViewportCenter();
      close();
      actions.pages.deletePageFlow({
        pageId: props.pageId,
        anchorKey: tmpanchor.key,
        placement: "center",
      });
      return;
    }

    close();
  } catch (e) {
    console.error("[PageActions] onMenuAction failed", e);
    close();
  } finally {
    console.groupEnd();
  }
}
//===MOVE TO====

const KEY_ROOT = "root";
const parentKeyOf = (parentId) =>
  parentId == null ? KEY_ROOT : String(parentId);

const expandedMove = ref(new Set()); // Set<string>

function isMoveExpanded(id) {
  return expandedMove.value.has(String(id));
}

function toggleMoveExpanded(id) {
  const k = String(id);
  const next = new Set(expandedMove.value);
  next.has(k) ? next.delete(k) : next.add(k);
  expandedMove.value = next;
}

//===DELETE ===
async function confirmDelete() {
  const id = props.pageId;
  if (!id) return;

  console.group("[PageActions] delete confirm");
  console.log("pageId:", id);

  try {
    const nextId = pagesStore.getNextPageIdAfterDelete?.(id);

    if (hasChildren.value && keepChildren.value) {
      try {
        await pagesStore.reparentChildrenToParent(id);
      } catch (e) {
        console.error("[PageActions] reparentChildrenToParent failed", e);
        throw e;
      }
    }

    try {
      await pagesStore.deletePage(id);
    } catch (e) {
      console.error("[PageActions] deletePage failed", e);
      throw e;
    }

    emit("deleted", id);
    close();

    if (nextId) router.push({ name: "pageDetail", params: { id: nextId } });
    else router.push("/");
  } catch (e) {
    console.error("[PageActions] DELETE FLOW FAILED", e);
  } finally {
    console.groupEnd();
  }
}
</script>

<template>
  <div class="controller-custom">
    <Teleport to="body">
      <!-- MAIN MENU -->
      <ActionMenuDB
        ref="mainMenuRef"
        :open="menuOpen"
        :anchorRect="anchorRect"
        :anchorEl="anchorEl"
        :items="menuItems"
        :placement="placement"
        :closeOnAction="false"
        @action="onMenuAction"
        @close="close"
      />

      <!-- DELETE POPOVER -->
      <ActionMenuDB
        ref="delMenuRef"
        :open="delOpen"
        :anchorRect="anchorRect"
        :anchorEl="anchorEl"
        :custom="true"
        :minWidth="minWidthDelete"
        :placement="placement"
        :maxWPost="400"
        :minHPre="800"
        @close="close"
      >
        <div class="del-pop">
          <div class="del-title">Delete page?</div>
          <div class="del-text">
            This will delete the page
            <span v-if="hasChildren"> and its subpages.</span>
          </div>

          <label v-if="hasChildren" class="del-check">
            <input type="checkbox" v-model="keepChildren" />
            Keep subpages (move to parent)
          </label>

          <div class="del-actions">
            <button class="btn-ghost" type="button" @click="close">
              Cancel
            </button>
            <button
              class="btn-ghost danger"
              type="button"
              @click="confirmDelete"
            >
              Delete
            </button>
          </div>
        </div>
      </ActionMenuDB>
    </Teleport>
  </div>
</template>

<style scoped>
.constroller-custom {
  color: var(--text-main);
}
.del-pop {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  color: var(--text-main);
}
.del-title {
  font-weight: 700;
  font-size: 14px;
}
.del-text {
  font-size: 13px;
  color: var(--text-secondary);
}
.del-check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.del-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  color: var(--text-secondary);
}
.move-pop {
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 300px;
  overflow-y: auto;
  overflow-x: hidden;
}
.move-header {
  font-weight: 600;
  font-size: 13px;
  padding: 6px 8px;
}
.move-sep {
  height: 1px;
  background: rgba(0, 0, 0, 0.1);
  margin: 6px 6px;
}

.move-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: transparent;
  border-radius: 10px;
  padding: 8px 10px;
  cursor: pointer;
  text-align: left;
  color: var(--text-secondary);
}
.move-row:hover {
  background: var(--bg-hover);
  color: var(--text-main);
}
.move-row:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.caret {
  width: 16px;
  display: inline-flex;
  justify-content: center;
}
.caret-spacer {
  width: 16px;
  display: inline-block;
}
.icon {
  width: 22px;
  display: inline-flex;
  justify-content: center;
}
.label {
  font-weight: 400;
  font-size: 14px;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.move-pop::-webkit-scrollbar {
  width: 13px;
}
.move-pop::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.18);
  border-radius: 10px;
  border: 3px solid transparent;
  background-clip: content-box;
}
.move-pop::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.26);
}
</style>
