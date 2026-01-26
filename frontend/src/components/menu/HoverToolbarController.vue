<script setup>
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { useOverlayStore } from "@/stores/overlay";
import { useBlocksStore } from "@/stores/blocks";
import { useEditorRegistryStore } from "@/stores/editorRegistry";
import { useSelectionPolicy } from "@/composables/useSelectionPolicy";
import { useSelectionToolbar } from "@/composables/useSelectionToolbar";
import { useOverlayBinding } from "@/composables/useOverlayBinding";
import BlockToolbar from "@/components/menu/BlockToolbar.vue";
import { useMenuActionDispatcher } from "@/composables/useMenuActionDispatcher";
import { MENU_COMMANDS } from "@/domain/menuActions";
import { useTempAnchors } from "@/actions/tempAnchors.actions";
import { useAnchorRegistryStore } from "@/stores/anchorRegistry";

const overlay = useOverlayStore();
const blocksStore = useBlocksStore();
const { currentBlockId } = storeToRefs(blocksStore);
const editorRegStore = useEditorRegistryStore();
const { dispatchMenuAction } = useMenuActionDispatcher();
const tempAnchors = useTempAnchors();
const anchorsStore = useAnchorRegistryStore();

const activeEditor = computed(() =>
  editorRegStore.getEditor(currentBlockId.value),
);

const activeType = computed(() => {
  const id = currentBlockId.value;
  if (!id) return "p";
  return blocksStore.blocksById[String(id)]?.type ?? "p";
});

const activeMarks = computed(() => ({
  bold: activeEditor.value?.isActive("bold") ?? false,
  italic: activeEditor.value?.isActive("italic") ?? false,
  strike: activeEditor.value?.isActive("strike") ?? false,
  code: activeEditor.value?.isActive("code") ?? false,
  link: activeEditor.value?.isActive("link") ?? false,
}));

const floatingEl = ref(null);
const selectionAnchorKey = ref(null);
const selectionAnchorRect = ref(null);

useSelectionPolicy({
  getActiveEditor: () => activeEditor.value,
  onCommitSelection: emitCommit,
  onClearSelection: emitClear,
});

function emitCommit() {
  window.dispatchEvent(new CustomEvent("selection-toolbar:commit"));
}

function emitClear() {
  window.dispatchEvent(new CustomEvent("selection-toolbar:clear"));
}

const {
  isOpen,
  x,
  y,
  close: closeSelectionToolbar,
} = useSelectionToolbar(activeEditor, {
  offsetY: 20,
  viewportMargin: 25,
  floatingEl,
  onAnchorRect: (rect) => {
    selectionAnchorRect.value = rect;
    selectionAnchorKey.value?.unregister?.();
    selectionAnchorKey.value = tempAnchors.registerFixedRect(rect);
  },
  shouldShow: ({ editor, state }) => {
    const { from, to } = state.selection;
    return editor.isFocused && from !== to;
  },
});

useOverlayBinding({
  id: "hoverbar",
  kind: "hoverbar",
  priority: 1,
  behaviour: "stack",

  isOpen: () => isOpen.value,
  requestClose: () => {
    selectionAnchorKey.value?.unregister?.();
    selectionAnchorKey.value = null;
    selectionAnchorRect.value = null;
    closeSelectionToolbar();
  },

  getMenuEl: () => floatingEl.value,
  getAnchorEl: () =>
    selectionAnchorKey.value
      ? anchorsStore.getAnchorEl(selectionAnchorKey.value.key)
      : null,

  options: {
    closeOnOutside: false,
    closeOnEsc: false,
    restoreFocus: false,
    stopPointerOutside: false,
  },
});

function getCtx() {
  const blockId = currentBlockId.value;
  if (!blockId) return null;
  const pageId = blocksStore.blocksById[String(blockId)]?.pageId ?? null;
  return { blockId: String(blockId), pageId };
}

function onCommand(command) {
  const ctx = getCtx();
  if (!ctx) return;
  return dispatchMenuAction({
    type: "command",
    ctx,
    command,
  });
}

async function onSetType(nextType) {
  if (nextType === activeType.value) return;

  try {
    const ed = activeEditor.value;
    if (ed) {
      const from = ed.state.selection.from;
      ed.commands.setTextSelection({ from, to: from });
      ed.commands.blur();
    }
  } catch {}

  closeSelectionToolbar();

  const ctx = getCtx();
  if (!ctx) return;

  await dispatchMenuAction({
    type: "command",
    ctx,
    command: MENU_COMMANDS.BLOCK_APPLY_TYPE,
    payload: { blockType: nextType },
  });

  blocksStore.requestFocus?.(ctx.blockId, -1);
}
</script>

<template>
  <Teleport to="body">
    <Transition name="ft">
      <div
        v-show="isOpen && overlay.has('hoverbar')"
        ref="floatingEl"
        class="floating-toolbar"
        :style="{
          position: 'fixed',
          left: x + 'px',
          top: y + 'px',
          transform: 'translate(-50%, -100%)',
        }"
        @mousedown.prevent
        @pointerdown.stop.prevent
        @pointerup.stop
        @click.stop
        @mousedown.stop.prevent
      >
        <BlockToolbar
          :activeType="activeType"
          :activeMarks="activeMarks"
          @set-type="onSetType"
          @command="onCommand"
        />
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.floating-toolbar {
  transform: var(--ft-translate) scale(1);
  transform-origin: bottom center;
  will-change: transform, opacity;
  z-index: 9999;
  pointer-events: auto;
  transition:
    opacity 5s ease,
    transform 0.3s ease;
  opacity: 1;
  height: 20px;
}

.floating-toolbar[style*="display: none"] {
  opacity: 0;
}

.ft-enter-active,
.ft-leave-active {
  transition:
    opacity 0.12s ease,
    transform 0.12s ease;
}

.ft-enter-from,
.ft-leave-to {
  opacity: 0;
  transform: var(--ft-translate) scale(0.96);
}

.ft-enter-to,
.ft-leave-from {
  opacity: 1;
  transform: var(--ft-translate) scale(1);
}
</style>
