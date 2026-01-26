<script setup>
import { computed, nextTick, ref, unref } from "vue";
import { useAppActions } from "@/actions/useAppActions";
import useLiveAnchorRect from "@/composables/useLiveAnchorRect";
import { useOverlayLayer } from "@/composables/useOverlayLayer";
import ActionMenuDB from "@/components/ActionMenuDB.vue";
import { useAnchorRegistryStore } from "@/stores/anchorRegistry";

const props = defineProps({
  pageId: { type: [String, Number], default: null },
  blockId: { type: [String, Number], default: null },
  anchorEl: { type: [Object, null], default: null }, // HTMLElement | ref
  anchorKey: { type: String, default: null },
  placement: { type: String, default: "bottom-end" },
  lockScrollOnOpen: { type: Boolean, default: false },
  anchorLocation: { type: String, default: "" },
});

const emit = defineEmits(["close"]);

const actions = useAppActions();
const anchorsStore = useAnchorRegistryStore();

const rectTriggerOpen = ref(false);
const menuOpen = ref(false);
const anyOpen = computed(() => menuOpen.value || rectTriggerOpen.value);

//const anchorResolved = computed(() => unref(props.anchorEl) ?? null)
const anchorResolved = computed(() => {
  if (props.anchorKey) return anchorsStore.getAnchorEl(props.anchorKey);
  return unref(props.anchorEl) ?? null;
});
const { anchorRect, scheduleUpdate, updateNow } = useLiveAnchorRect(
  anchorResolved,
  anyOpen,
);

const menuRef = ref(null);
const activeMenuEl = computed(() =>
  menuOpen.value ? (menuRef.value?.el?.value ?? null) : null,
);

const layerId = computed(() =>
  props.blockId ? `${props.anchorLocation}:code-lang:${props.blockId}` : null,
);

function close() {
  rectTriggerOpen.value = false;
  menuOpen.value = false;
  emit("close");
}
async function open() {
  if (!props.blockId) return;

  rectTriggerOpen.value = true;
  await nextTick();
  updateNow();
  await new Promise(requestAnimationFrame);
  updateNow();

  menuOpen.value = true;
  rectTriggerOpen.value = false;
  nextTick(() => scheduleUpdate());
}
function toggle() {
  anyOpen.value ? close() : open();
}

defineExpose({ open, close, toggle });

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

const LANGS = [
  { id: "plaintext", label: "Plain text" },
  { id: "javascript", label: "JavaScript" },
  { id: "typescript", label: "TypeScript" },
  { id: "python", label: "Python" },
  { id: "json", label: "JSON" },
  { id: "bash", label: "Bash" },
  { id: "sql", label: "SQL" },
  { id: "html", label: "HTML" },
  { id: "css", label: "CSS" },
  { id: "markdown", label: "Markdown" },
  { id: "yaml", label: "YAML" },
];

const items = computed(() =>
  LANGS.map((l) => ({
    type: "item",
    id: `lang:${l.id}`,
    label: l.label,
    payload: { language: l.id },
  })),
);

async function onAction({ id, payload }) {
  if (!props.blockId) return;
  if (id.startsWith("lang:")) {
    await actions.blocks.updateBlockContent(
      String(props.blockId),
      { language: payload.language },
      { undo: true, label: "codeLanguage" }
    );
    close();
    return;
  }
  close();
}
</script>

<template>
  <Teleport to="body">
    <ActionMenuDB
      ref="menuRef"
      :open="menuOpen"
      :anchorRect="anchorRect"
      :anchorEl="anchorEl"
      :items="items"
      :placement="placement"
      :closeOnAction="false"
      @action="onAction"
      @close="close"
    />
  </Teleport>
</template>
