<script setup lang="ts">
import { computed, nextTick, ref, unref } from "vue";
import useLiveAnchorRect from "@/composables/useLiveAnchorRect";
import { useOverlayLayer } from "@/composables/useOverlayLayer";
import ActionMenuDB from "@/components/ActionMenuDB.vue";
import { useAnchorRegistryStore } from "@/stores/anchorRegistry";
import { useEditorRegistryStore } from "@/stores/editorRegistry";

const props = defineProps({
  pageId: { type: [String, Number], default: null },
  blockId: { type: [String, Number], default: null },
  docNodeId: { type: [String, Number], default: null },
  anchorEl: { type: [Object, null], default: null }, // HTMLElement | ref
  anchorKey: { type: String, default: null },
  placement: { type: String, default: "bottom-end" },
  lockScrollOnOpen: { type: Boolean, default: false },
  anchorLocation: { type: String, default: "" },
});

const emit = defineEmits(["close"]);

const anchorsStore = useAnchorRegistryStore();
const editorReg = useEditorRegistryStore();

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

const layerId = computed(() => {
  if (props.docNodeId)
    return `${props.anchorLocation}:code-lang:${props.docNodeId}`;
  if (props.blockId)
    return `${props.anchorLocation}:code-lang:${props.blockId}`;
  return null;
});

function close() {
  rectTriggerOpen.value = false;
  menuOpen.value = false;
  emit("close");
}
async function open() {
  if (!props.blockId && !props.docNodeId) return;

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
  const pageId = props.pageId != null ? String(props.pageId) : null;
  const docNodeId = props.docNodeId != null ? String(props.docNodeId) : null;
  if (id.startsWith("lang:")) {
    if (!pageId || !docNodeId) {
      close();
      return;
    }
    const editor = editorReg.getEditor(`doc:${pageId}`);
    if (!editor) {
      close();
      return;
    }
    let draggablePos: number | null = null;
    if (docNodeId.startsWith("docnode:")) {
      const posRaw = docNodeId.slice("docnode:".length);
      const parsed = Number(posRaw);
      draggablePos = Number.isFinite(parsed) ? parsed : null;
    } else {
      editor.state.doc.descendants((node, pos) => {
        if (node?.type?.name !== "draggableItem") return true;
        const itemId = node.attrs?.id != null ? String(node.attrs.id) : "";
        if (itemId && itemId === docNodeId) {
          draggablePos = pos;
          return false;
        }
        return true;
      });
    }
    if (typeof draggablePos !== "number") {
      close();
      return;
    }
    const wrapper = editor.state.doc.nodeAt(draggablePos);
    if (!wrapper || wrapper.type.name !== "draggableItem") {
      close();
      return;
    }

    let codePos = null;
    wrapper.descendants((node, pos) => {
      if (node.type.name === "codeBlock") {
        codePos = draggablePos + pos + 1;
        return false;
      }
      return true;
    });

    if (typeof codePos === "number") {
      const codeNode = editor.state.doc.nodeAt(codePos);
      if (codeNode) {
        const tr = editor.state.tr.setNodeMarkup(codePos, codeNode.type, {
          ...codeNode.attrs,
          language: payload.language,
        });
        editor.view.dispatch(tr);
      }
    }

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
