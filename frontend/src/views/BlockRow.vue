<script setup>
import BlockEditor from "@/views/BlockEditor.vue";
import { useBlocksStore } from "@/stores/blocks";
import {
  nextTick,
  computed,
  ref,
  onMounted,
  onBeforeUnmount,
  toRef,
  watch,
  useAttrs,
} from "vue";
import { classForTextToken, classForBgToken } from "@/theme/colorsCatalog";
import CodeToolbarButtons from "@/components/CodeToolbarButtons.vue";

import { anchorKey, anchorKind } from "@/ui/anchorsKeyBind";
import { useRegisterAnchors } from "@/composables/useRegisterAnchors";
import { useUIOverlayStore } from "@/stores/uioverlay";

import { useAppActions } from "@/actions/useAppActions";

defineOptions({ inheritAttrs: false });
const attrs = useAttrs();

const blocksStore = useBlocksStore();
const uiOverlay = useUIOverlayStore();
const actions = useAppActions();

const props = defineProps({
  block: Object,
  pageId: String,
  level: Number,
  parentKey: String,
  registerMenuAnchor: Function,
  blockActionMenuId: String,
  lastEmptyRootId: { type: [String, Number, null], default: null },
  registerRowEl: Function,
});

const dragHandleRef = ref(null);
const toolbarRef = ref(null);

const dragHandle_key = anchorKey(
  anchorKind("block", "dragHandle", "blockRow", "gutter"),
  props.block.id,
);

useRegisterAnchors({
  [dragHandle_key]: dragHandleRef,
});

function openBlockMenuFromHandle() {
  uiOverlay.requestOpen({
    menuId: "block.menu",
    anchorKey: dragHandle_key,
    payload: {
      blockId: props.block.id,
      placement: "right-center",
    },
  });
}
function openBlockMenuFromDots() {
  uiOverlay.requestOpen({
    menuId: "block.menu",
    anchorKey: toolbarRef.value?.dots_key,
    payload: {
      blockId: props.block.id,
      placement: "left",
    },
  });
}
function openLangMenu() {
  uiOverlay.requestOpen({
    menuId: "block.codeLanguageMenu",
    anchorKey: toolbarRef.value?.lang_key,
    payload: {
      blockId: props.block.id,
      placement: "bottom-end",
    },
  });
}

function handleToggleWrap() {
  console.log("TOGGLE WRAP for block:", props.block.id);
  blocksStore.updateBlockContent(props.block.id, {
    wrap: !(props.block.content?.wrap ?? true),
  });
}

async function handleInsertAfter() {
  await actions.blocks.insertBlockAfterAndFocus(props.block.id);
}

const isToggle = computed(() => props.block.type === "toggle");

const isExpanded = computed(() => blocksStore.isExpanded(props.block.id));
function handleToggleExpand(e) {
  e?.stopPropagation?.();
  blocksStore.toggleExpandBlock?.(props.block.id);
}

///===FOR BLANCK DETECTION==== IMPORTANT!

onMounted(() => {
  props.registerRowEl?.(props.block.id, rowElement.value);
});

onBeforeUnmount(() => {
  props.registerRowEl?.(props.block.id, null);
});

//===COLOR PICKER====
const styleClasses = computed(() => {
  const s = props.block?.props?.style ?? {};

  return [
    classForTextToken(s.textColor ?? "default"),
    classForBgToken(s.bgColor ?? "default"),
  ];
});

let INDENT = 24;

const isHighlighted = ref(false);

const blockActionMenuId = toRef(props, "blockActionMenuId");

watch(
  blockActionMenuId,
  (newId) => {
    //console.log("blockActionMenu:", newId)
    isHighlighted.value =
      typeof newId === "string" &&
      newId.includes(String(props.block?.id)) &&
      newId.includes(String("blockRow"));
  },
  { immediate: true },
);

const rowElement = ref(null);
</script>

<template>
  <div
    class="block-item"
    :data-id="block.id"
    :data-parent="parentKey"
    :style="{ marginLeft: `${level * INDENT}px` }"
  >
    <!-- GUTTER -->
    <div class="gutter">
      <button
        class="plus"
        type="button"
        title="Add block"
        @click.stop="handleInsertAfter"
      >
        +
      </button>

      <button
        ref="dragHandleRef"
        class="drag-handle"
        type="button"
        title="Drag"
        @click.stop="openBlockMenuFromHandle"
      >
        ⋮⋮
      </button>
    </div>

    <!-- CONTENT ROW -->
    <div
      ref="rowElement"
      class="row"
      :class="[
        { highlighted: isHighlighted },
        { 'is-code-card': block.type === 'code' },
        { 'is-callout': block.type === 'callout' },
        { 'is-toggle': isToggle },
      ]"
    >
      <div class="rowLeft" :class="{ 'has-toggle': isToggle }">
        <button
          v-if="isToggle"
          class="chevron"
          :class="{ expanded: isExpanded }"
          type="button"
          :title="isExpanded ? 'Collapse' : 'Expand'"
          @click.stop="handleToggleExpand"
        >
          ▸
        </button>

        <div
          class="blockContent"
          :class="styleClasses"
          :style="{
            color: `var(--${classForTextToken(block.props.style.textColor)})`,
          }"
        >
          <BlockEditor
            :block="block"
            :pageId="pageId"
            :lastEmptyRootId="lastEmptyRootId"
            v-bind="attrs"
          />
        </div>
      </div>
      <div class="blockActions" v-if="block.type === 'code'">
        <CodeToolbarButtons
          ref="toolbarRef"
          :blockId="block.id"
          :isCode="block.type === 'code'"
          :languageLabel="block.content?.language ?? 'plaintext'"
          :wrapOn="block.content?.wrap ?? true"
          @wrap="handleToggleWrap"
          @lang="openLangMenu"
          @dots="openBlockMenuFromDots"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.chevron {
  width: 22px;
  height: 22px;
  align-self: start;
  margin-top: 2px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  display: grid;
  place-items: center;
  color: var(--text-secondary);

  transform: rotate(0deg);
  transition:
    transform 140ms cubic-bezier(0.2, 0.8, 0.2, 1),
    background-color 120ms ease,
    color 120ms ease;
  will-change: transform;
}

/* sempre visibile sul toggle */
.rowLeft.has-toggle .chevron {
  opacity: 1;
  pointer-events: auto;
}

.chevron.expanded {
  transform: rotate(90deg);
}

.chevron:hover {
  background: var(--bg-icon-hover);
  color: var(--text-main);
}

/* IMPORTANT: flex child shrink */
.blockContent {
  min-height: 0;
  width: 100%;
  min-width: 0;
}

.block-item {
  display: grid;
  grid-template-columns: var(--block-gutter) 1fr;
  gap: var(--block-gap);
  align-items: stretch;
  padding: 0; /* IMPORTANT: nessun padding qui */
}

/* GUTTER */
.gutter {
  display: flex;
  align-items: start;
  padding-top: 3px;
  padding-right: 10px;
  justify-content: center;
  gap: 6px;
}

/* ROW (hover area) */
/* ROW base: grid con colonna azioni fissa */

.row {
  min-width: 70px;
  display: grid;
  grid-template-columns: 1fr var(--block-actions-w);
  align-items: stretch;
  gap: 6px;

  padding: 0 0 0px var(--block-row-pad-x);
  border-radius: 2px;
  padding-right: 4px;
  padding-top: 4px;
  padding-bottom: 4px;
  padding-left: 3px;
  cursor: text;
}
.rowLeft {
  position: relative;
  display: grid;
  align-items: stretch;
  min-width: 0;
  padding: 0;
  min-height: 0;
  overflow: hidden;
  background: transparent !important;
}
/* solo se toggle: aggiungi spazio tra chevron e testo */
.rowLeft.has-toggle {
  gap: 6px;
}
.row.is-toggle {
  padding-left: 0px; /* o 2px */
}

/* ========== CODE CARD ========== */
.row.is-code-card {
  /* card styling in tema chiaro */
  border: 0px solid rgba(0, 0, 0, 0.1);
  background: transparent;
  border-radius: 12px;
  overflow: hidden;

  /* qui diamo un po' più respiro */
  padding-bottom: 8px;
  padding-left: 6px;
  padding-right: 0px;
  margin-top: 5px;
  margin-bottom: 5px;
}
.code-pills {
  position: absolute;
  top: var(--code-toolbar-top);
  right: calc(var(--block-actions-w) + var(--code-actions-gap));
  display: inline-flex;
  gap: 6px;
  opacity: 0;
  pointer-events: none;
}
.block-item:hover .code-pills,
.block-item:focus-within .code-pills {
  opacity: 1;
  pointer-events: auto;
}

/* wrap-pill e lang-pill ora NON più absolute */
.wrap-pill,
.lang-pill {
  position: static;
  opacity: 1;
  pointer-events: auto;
}

/* ========== CALLOUT ========== */

.row.is-callout {
  border-radius: 16px;
}

/* Spingiamo il contenuto sotto la top bar (solo code) */
.row.is-code-card .blockContent {
  padding-top: var(--code-toolbar-h);
  min-width: 0;
}

/* hover SOLO sul contenuto */
.block-item:hover .row {
  /*background: rgba(0, 0, 0, 0.03);*/
}

.highlighted {
  background: rgba(0, 0, 0, 0.03);
}

/* Handle + plus: solo su hover */
.drag-handle,
.plus {
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 120ms ease,
    background-color 120ms ease;
}

.block-item:hover .drag-handle,
.block-item:hover .plus {
  opacity: 1;
  pointer-events: auto;
}

/* PLUS — quadrato su hover */
.plus {
  width: 30px;
  height: 25px;
  border-radius: 6px; /* quadrato morbido */
  border: 0;
  background: transparent;
  cursor: pointer;
  display: grid;
  place-items: center;
  transform: translateY(2.5px);
  align-items: center;
  justify-items: center;
  color: var(--text-muted);
  font-size: 18px;
}

.plus:hover {
  background: rgba(0, 0, 0, 0.08);
  color: var(--text-main);
}

/* DRAG HANDLE */
.drag-handle {
  width: 24px;
  height: 30px;
  padding-left: 4px;
  padding-right: 4px;
  border-radius: 6px;
  border: 0;
  background: transparent;
  cursor: grab;
  display: grid;
  align-items: center;
  color: var(--text-muted);
  font-size: 22px;
}

.drag-handle:hover {
  /*background: rgba(0,0,0,.08);*/
  background: var(--bg-icon-hover);
  color: var(--text-main);
}

.drag-handle:active {
  cursor: grabbing;
}

/* Contenuto */
.blockContent {
  position: relative;
  min-width: 0;
  border-radius: 12px;
}

/* Actions column sempre uguale (allineamento dots) */
.blockActions {
  position: relative;
  display: block;
  width: var(--block-actions-w);
}
/* Actions column sempre uguale (allineamento dots) */
.blockActions {
  position: relative;
  display: block;
  width: var(--block-actions-w);
}

/* Dots: sempre ancorati in alto a destra (ma visibili solo hover/focus come già fai) */
.dots {
  position: absolute;
  top: var(--code-toolbar-top);
  right: 0;

  width: var(--block-row-btn);
  height: var(--block-row-btn);
  border-radius: 8px;
  border: 0;
  background: transparent;
  cursor: pointer;

  opacity: 0;
  pointer-events: none;
}

.block-item:hover .dots,
.block-item:focus-within .dots {
  opacity: 1;
  pointer-events: auto;
}

.dots:hover {
  background: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.85);
}

.block-item .icon-ghost {
  opacity: 0;
  pointer-events: none;
}

.block-item:hover .icon-ghost,
.block-item:focus-within .icon-ghost {
  opacity: 1;
  pointer-events: auto;
}

/* Pill: assoluto, a sinistra del gutter dots, così non sposta layout */
.lang-pill {
  position: absolute;
  top: var(--code-toolbar-top);
  right: calc(var(--block-actions-w) + var(--code-actions-gap));

  height: var(--block-row-btn);
  border-radius: var(--bar-radius);
  border: 0px solid rgba(0, 0, 0, 0.1);
  background: rgba(0, 0, 0, 0.03);
  cursor: pointer;

  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  gap: 6px;

  color: rgba(0, 0, 0, 0.7);
  font-size: 13px;

  opacity: 0;
  pointer-events: none;
}

.block-item:hover .lang-pill,
.block-item:focus-within .lang-pill {
  opacity: 1;
  pointer-events: auto;
}

.lang-pill:hover {
  background: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.85);
}

.lang-pill::after {
  content: "▾";
  font-size: 11px;
  margin-left: 4px;

  opacity: 0;
  transform: translateY(-1px);
  transition: opacity 120ms ease;
}

/* SOLO hover sul bottone */
.lang-pill:hover::after {
  opacity: 0.6;
}

.block-item:hover .lang-pill::after,
.block-item:focus-within .lang-pill::after {
  opacity: 0.6;
}
</style>
