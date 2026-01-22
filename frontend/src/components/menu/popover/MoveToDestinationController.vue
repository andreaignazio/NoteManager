<script setup lang="ts">
import { computed, nextTick, ref, unref, watch, useAttrs } from "vue";
import ActionMenuDB from "@/components/ActionMenuDB.vue";
import PagePickerList from "@/components/PagePickerList.vue";

import { useAnchorRegistryStore } from "@/stores/anchorRegistry";
import useLiveAnchorRect from "@/composables/useLiveAnchorRect";
import { useOverlayBinding } from "@/composables/useOverlayBinding";
import type { AnchorLike, OverlayBinding } from "@/stores/overlay";

defineOptions({ inheritAttrs: false });
const attrs = useAttrs();

const props = defineProps({
  // anchor
  anchorKey: { type: String, default: null },
  anchorEl: { type: [Object, null], default: null }, // HTMLElement | Ref<HTMLElement|null>

  // ui
  title: { type: String, default: "Move to…" },
  placement: { type: String, default: "left-start" },
  minWidth: { type: Number, default: 340 },
  gap: { type: Number, default: 6 },
  sideOffsetX: { type: Number, default: 0 },
  lockScrollOnOpen: { type: Boolean, default: false },

  // picker context
  currentPageId: { type: [String, Number, null], default: null },

  // rules (external)
  disabledIds: { type: [Array, Set, null], default: null },
  allowRoot: { type: Boolean, default: false },
  rootLabel: { type: String, default: "Top level" },

  // overlay
  interactionScope: { type: String, default: "global" }, // 'local' | 'global'
});

const POPOVER_W = 350;
const POPOVER_H = 350;
const POPOVER_TOP_H = 40;
const LIST_H = POPOVER_H - POPOVER_TOP_H;
const GAP = 10;
const MARGIN = 10;

const emit = defineEmits<{
  (e: "select", targetPageId: string | null): void;
  (e: "close"): void;
}>();

const anchorsStore = useAnchorRegistryStore();

// internal open state
const open = ref(false);
function openMenu() {
  open.value = true;
}
function closeMenu() {
  if (!open.value) return;
  open.value = false;
  emit("close");
}
defineExpose({ open: openMenu, close: closeMenu });

// resolve anchor
const anchorResolved = computed(() => {
  if (props.anchorKey)
    return anchorsStore.getAnchorEl(props.anchorKey) as AnchorLike;
  return unref(props.anchorEl) ?? null;
});

// rect tracking
const { anchorRect, scheduleUpdate } = useLiveAnchorRect(anchorResolved, open);

watch(open, async (v) => {
  if (!v) return;
  await nextTick();
  scheduleUpdate();
});

// select from picker
function onSelect(id: any) {
  // PagePickerList può emettere null (root) se allowRoot
  const target = id == null ? null : String(id);
  emit("select", target);
  closeMenu();
}

// overlay binding (ID stabile)
const menuRef = ref<any>(null);
const menuEl = computed(() => menuRef.value?.$el ?? null);

const binding: OverlayBinding = {
  id: "global:move-destination",

  kind: "dropdown",
  priority: 60,

  behaviour: "exclusiveKinds",
  exclusiveKinds: ["hoverbar", "dropdown"],
  isOpen: () => open.value,
  getInteractionScope: () => "local",
  getMenuEl: () => menuEl.value?.$el ?? null,
  getAnchorEl: () => anchorResolved.value,

  requestClose: (reason) => {
    closeMenu();
  },

  options: {
    closeOnEsc: true,
    closeOnOutside: true,
    stopPointerOutside: true,
    lockScroll: !!props.lockScrollOnOpen,
    restoreFocus: false,
    allowAnchorClick: true,
  },
};

useOverlayBinding(binding);

const pagePickerRef = ref<any>(null);

watch(open, async (isOpen) => {
  if (!isOpen) return;
  await nextTick();
  pagePickerRef.value?.focusSearch?.();
});
</script>

<template>
  <Teleport to="body">
    <div
      class="card"
      :style="{ width: POPOVER_W + 'px', maxHeight: POPOVER_H + 'px' }"
    >
      <ActionMenuDB
        ref="menuRef"
        v-bind="attrs"
        :open="open"
        :anchorRect="anchorRect"
        :anchorEl="anchorResolved"
        custom
        :placement="placement"
        :minWidth="minWidth"
        :gap="gap"
        :sideOffsetX="sideOffsetX"
        :maxHPost="360"
        :maxWPost="420"
        :xPre="12"
        :yPre="12"
        :xPost="16"
        :yPost="200"
        @close="closeMenu"
      >
        <PagePickerList
          ref="pagePickerRef"
          :title="title"
          :maxHeight="LIST_H - 40"
          :currentPageId="currentPageId"
          :disabledIds="disabledIds"
          :allowRoot="allowRoot"
          :rootLabel="rootLabel"
          @select="onSelect"
        />
      </ActionMenuDB>
    </div>
  </Teleport>
</template>
<style scoped>
.card {
  border-radius: 14px;
  background: var(--bg-menu, rgba(255, 255, 255, 0.94));
  border: 1px solid rgba(0, 0, 0, 0.1);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
