<script setup>
import { computed, nextTick, ref, unref, watch } from "vue";
import useLiveAnchorRect from "@/composables/useLiveAnchorRect";
import { useTempAnchors } from "@/actions/tempAnchors.actions";
import ActionMenuDB from "@/components/ActionMenuDB.vue";

import { useAnchorRegistryStore } from "@/stores/anchorRegistry";
import { useOverlayBindingKeyed } from "@/composables/useOverlayBindingKeyed";
import { useMenuActionDispatcher } from "@/composables/useMenuActionDispatcher";
import { MENU_COMMANDS } from "@/domain/menuActions";
import { buildPageActionsMenu } from "@/domain/pageMenuBuilders";
import usePagesStore from "@/stores/pages";
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

const anchorsStore = useAnchorRegistryStore();
const { dispatchMenuAction } = useMenuActionDispatcher();
const pagesStore = usePagesStore();
// open states
const rectTriggerOpen = ref(false);
const menuOpen = ref(false);

const anyOpen = computed(() => menuOpen.value || rectTriggerOpen.value);

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

const activeMenuEl = computed(() => {
  return menuOpen.value ? (mainMenuRef.value?.el?.value ?? null) : null;
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

const canDelete = computed(() => {
  if (!props.pageId) return false;
  const page = pagesStore.pagesById?.[String(props.pageId)];
  return page?.role === "owner";
});

const menuItems = computed(() =>
  buildPageActionsMenu({ canDelete: canDelete.value }),
);

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
      await dispatchMenuAction({
        type: "openMenu",
        ctx: { pageId: String(props.pageId), anchorKey: props.anchorKey },
        menuId: "page.titlePopover",
        anchorKey: props.anchorKey ?? undefined,
        payload: { pageId: props.pageId },
      });

      return;
    }

    if (id === "duplicate") {
      close();
      await dispatchMenuAction({
        type: "command",
        ctx: { pageId: String(props.pageId) },
        command: MENU_COMMANDS.PAGE_DUPLICATE,
      });
      return;
    }

    if (id === "move") {
      const tmpanchor = tempAnchors.registerViewportCenter();
      close();
      await dispatchMenuAction({
        type: "openMenu",
        ctx: { pageId: String(props.pageId) },
        menuId: "page.moveTo",
        anchorKey: tmpanchor.key,
        payload: {
          pageId: props.pageId,
          placement: "center",
          cleanup: tmpanchor.unregister,
        },
      });
      return;
    }

    if (id === "share") {
      const tmpanchor = props.anchorKey
        ? null
        : tempAnchors.registerViewportCenter();
      close();
      await dispatchMenuAction({
        type: "openMenu",
        ctx: { pageId: String(props.pageId) },
        menuId: "page.share",
        anchorKey: props.anchorKey ?? tmpanchor?.key,
        payload: {
          pageId: props.pageId,
          placement: "bottom-end",
          cleanup: tmpanchor?.unregister,
        },
      });
      return;
    }

    if (id === "delete") {
      close();
      await dispatchMenuAction({
        type: "command",
        ctx: { pageId: String(props.pageId) },
        command: MENU_COMMANDS.PAGE_DELETE,
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
