<script setup>
import {
  computed,
  nextTick,
  ref,
  watch,
  onMounted,
  toRef,
  onBeforeUnmount,
} from "vue";
import { storeToRefs } from "pinia";

import usePagesStore from "@/stores/pages";
import { useBlocksStore } from "@/stores/blocks";
import { useOverlayStore } from "@/stores/overlay";
import { useUiStore } from "@/stores/ui";
import { useEditorRegistryStore } from "@/stores/editorRegistry";

import BlockRow from "@/views/BlockRow.vue";
import DndController from "@/components/draggableList/DndController.vue";

import BlockToolbar from "@/components/menu/BlockToolbar.vue";

import { useSelectionPolicy } from "@/composables/useSelectionPolicy";
import { useSelectionToolbar } from "@/composables/useSelectionToolbar";

import { usePageBlankClickFocus } from "@/composables/page/usePageBlankClickFocus";
import { usePageTitleEditor } from "@/composables/page/usePageTitleEditor";

import { useOverlayBinding } from "@/composables/useOverlayBinding";

const ui = useUiStore();
const pagesStore = usePagesStore();
const blocksStore = useBlocksStore();

const { currentPageId } = storeToRefs(pagesStore);

const overlay = useOverlayStore();

const errorMsg = ref("");

const props = defineProps({
  id: String,
});

//===LAYOUT TICK ON RESIZE===

const layoutTick = ref(0);
const bumpLayoutTick = () => {
  layoutTick.value++;
};

onMounted(() => window.addEventListener("resize", bumpLayoutTick));
onBeforeUnmount(() => window.removeEventListener("resize", bumpLayoutTick));

//===PAGE TITLE EDITOR===
const titleInputEl = ref(null);

const pageIdRef = toRef(props, "id");
const {
  onTitleInput,
  titleValueForInput,
  isUntitled,
  onTitleMouseDown,
  onTitleFocus,
  onTitleBlur,
  onTitleKeydown,
} = usePageTitleEditor(pageIdRef);

function focusTitleInput() {
  nextTick(() => {
    titleInputEl.value?.focus();
    //posiziona cursore in fondo
    const val = titleInputEl.value?.value || "";
    titleInputEl.value?.setSelectionRange(val.length, val.length);
  });
}

watch(
  () => pagesStore.pendingFocusTitlePageId,
  (newPageId) => {
    if (newPageId === props.id) {
      focusTitleInput();
      pagesStore.consumeTitleFocusRequest(newPageId);
    }
  },
);

//===LOAD PAGE & BLOCKS ON ID CHANGE===

watch(
  () => props.id,
  async (newId) => {
    await pagesStore.openPage(newId);
    await blocksStore.fetchBlocksForPage(newId);
    const rootIds = blocksStore.childrenByParentId[newId]?.root;
    const firstId = rootIds?.[0];
    const title = titleValueForInput.value;
    // aggiorna ui.lastOpenedPageId
    ui.lastOpenedPageId = newId;
    if (!firstId) {
      await ensureFirstEmptyBlockAndFocus();
    }
    if (title.trim() === "") {
      focusTitleInput();
    } else {
      return;
    }
  },
  { immediate: true },
);

//====OVERLAY TOP ID====(for menu highlight)
const overlayTopId = computed(() => (overlay.hasAny ? overlay.top?.id : null));

//====BLOCKS FOR RENDER====
//pageId = props.id
const { childrenByParentId, blocksById, expandedById } =
  storeToRefs(blocksStore);
const KEY_ROOT = "root";
const sourceTree = computed(() => {
  if (!childrenByParentId.value?.[props.id] || !blocksById.value) return [];
  // ... la tua funzione buildForest rivista ...
  return buildForest(
    childrenByParentId.value[props.id],
    blocksById.value,
    expandedById.value, // <--- Passiamo la mappa dello store
  );
});

const localTree = ref([]);

watch(
  sourceTree,
  (newVal) => {
    localTree.value = newVal;
  },
  { immediate: true, deep: true },
);

function buildForest(childrenMap, contentMap, expandedMap) {
  const rootIds = childrenMap[KEY_ROOT] ?? [];

  function buildNode(id) {
    const pageData = contentMap[id];
    if (!pageData) return null;

    const allChildIds = childrenMap[id] ?? [];
    const hasChildren = allChildIds.length > 0;

    let isExpanded = blocksStore.isExpanded(id);

    const visibleChildren = isExpanded
      ? allChildIds.map((childId) => buildNode(childId)).filter(Boolean)
      : [];

    return {
      ...pageData,
      hasChildren,
      isExpanded,
      children: visibleChildren,
    };
  }

  return rootIds.map((rootId) => buildNode(rootId)).filter(Boolean);
}

//===DND CONTROLLER MOVE HANDLER===
const handleMove = async ({ id, parentId, position }) => {
  console.log(
    "Evento ricevuto dal generico:",
    "id:",
    id,
    "parent:",
    parentId,
    "pos:",
    position,
  );

  if (blocksStore.isCircularMove(id, parentId, blocksStore.blocksById)) {
    console.warn("Operazione bloccata: tentativo di creare un ciclo infinito.");
    localTree.value = buildForest(
      blocksStore.childrenByParentId[props.id],
      blocksStore.blocksById,
      blocksStore.expandedById,
    );
    return;
  }

  try {
    await blocksStore.moveBlock(props.id, id, { parentId, position });
  } catch (e) {
    console.error(e);
    //await pagesStore.fetchPages()
  }
};

async function onCreateFirstToggleChild(toggleEl) {
  const toggleId = String(toggleEl.id);

  // assicura che sia aperto
  blocksStore.expandBlock(toggleId);

  const newId = await blocksStore.addChildBlock(props.pageId, toggleId, {
    type: DEFAULT_BLOCK_TYPE, // o 'p'
    content: { text: "" },
  });

  await nextTick();
  blocksStore.requestFocus(newId, 0);
}

//===PAGE BLANK CLICK FOCUS===

const {
  onPagePointerDown,
  registerRowEl,
  ensureFirstEmptyBlockAndFocus,
  lastEmptyRootId,
} = usePageBlankClickFocus(pageIdRef, { getLocalTree: () => localTree.value });

//====EDITOR REGISTRY + ACTIVE EDITOR====
const { currentBlockId } = storeToRefs(blocksStore);

const editorRegStore = useEditorRegistryStore();

const activeEditor = computed(() =>
  editorRegStore.getEditor(currentBlockId.value),
);
const registerEditor = editorRegStore.registerEditor;

//====TOOLBAR + SELECTION RELATED EVENTS===

const activeType = computed(() => {
  const id = currentBlockId.value;
  if (!id) return "p";
  return blocksStore.blocksById[String(id)]?.type ?? "p";
});

const floatingEl = ref(null);

useSelectionPolicy({
  getActiveEditor: () => activeEditor.value,
  onCommitSelection: emitCommit,
  onClearSelection: emitClear,
});

function emitCommit() {
  //console.log('[selectionPolicy] COMMIT')
  window.dispatchEvent(new CustomEvent("selection-toolbar:commit"));
}

function emitClear() {
  //console.log('[selectionPolicy] CLEAR')
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
  shouldShow: ({ editor, state }) => {
    //console.log('editor.value', editor)
    const { from, to } = state.selection;
    return editor.isFocused && from !== to;
  },
});

const overlayBinding = useOverlayBinding({
  id: "hoverbar",
  kind: "hoverbar",
  priority: 1,
  behaviour: "stack",

  isOpen: () => isOpen.value, // LIVE
  requestClose: (reason) => closeSelectionToolbar(), // non svela logica

  getMenuEl: () => floatingEl.value,

  options: {
    closeOnOutside: false,
    closeOnEsc: false,
    restoreFocus: false,
    stopPointerOutside: false,
  },
});

async function setBlockTypeFromToolbar(nextType) {
  console.log("setBlockTypeFromToolbar:", nextType);
  console.log("activeType:", activeType.value);
  if (nextType === activeType) return;

  // 1) collassa la selection (così compute() chiude e NON riapre)
  try {
    const ed = activeEditor.value;
    console.log("activeEditor in setBlockTypeFromToolbar:", ed);
    if (ed) {
      const from = ed.state.selection.from;
      ed.commands.setTextSelection({ from, to: from });
      ed.commands.blur();
    }
  } catch {}

  closeSelectionToolbar();

  // 3) cambia tipo
  try {
    await blocksStore.updateBlockType(blocksStore.currentBlockId, nextType);
    blocksStore.requestFocus(blocksStore.currentBlockId, -1);
  } catch {
    errorMsg.value = "Error changing block type";
  }
}

const blockListEl = ref(null);

const { pendingPageviewScrollToBlockId } = storeToRefs(ui);

// helper: 1 frame
function raf() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

// helper: risolve root anche se ref punta a un componente Vue
function resolveRoot(refValue) {
  if (!refValue) return null;
  // se è un componente Vue, usa $el
  if (refValue.$el) return refValue.$el;
  return refValue; // HTMLElement
}

// helper: clamp numero
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// scroll manuale: centra el dentro container
function scrollElementToCenter(el, container, behavior = "smooth") {
  if (!el || !container) return;

  const elRect = el.getBoundingClientRect();
  const cRect = container.getBoundingClientRect();

  // posizione del centro elemento nello "spazio scroll" del container
  const elCenterInScroll =
    elRect.top - cRect.top + container.scrollTop + elRect.height / 2;

  const targetTop = elCenterInScroll - container.clientHeight / 2;

  const maxTop = container.scrollHeight - container.clientHeight;
  const finalTop = clamp(targetTop, 0, Math.max(0, maxTop));

  container.scrollTo({ top: finalTop, behavior });
}

// attende che l'elemento compaia nel DOM (retry su più frame)
async function waitForEl(getRoot, selector, maxFrames = 120) {
  for (let i = 0; i < maxFrames; i++) {
    await nextTick();
    await raf();

    const root = getRoot();
    const el = root && root.querySelector ? root.querySelector(selector) : null;
    if (el) return el;
  }
  return null;
}

/**
 * PATCH: watcher scroll-to-block con scroll manuale al centro
 *
 * prerequisiti:
 * - blockListEl è un ref (DOM node o componente)
 * - pendingPageviewScrollToBlockId è una ref dallo store
 * - ui.consumeScrollToBlockRequest(blockId) esiste
 */

const page = ref(null);
watch(
  pendingPageviewScrollToBlockId,
  async (blockId) => {
    if (!blockId) return;

    const selector = `[data-block-id="${blockId}"]`;

    const el = await waitForEl(
      () => resolveRoot(page.value),
      selector,
      500, // aumenta se serve (fetch più lento / transizioni)
    );

    if (!el) {
      console.warn("scrollToBlock: element not found", blockId);
      return; // NON consumare: così puoi riprovare quando arriverà davvero
    }

    const root = resolveRoot(page.value);

    // scroll manuale al centro
    scrollElementToCenter(el, root, "smooth");

    // focus senza rispostare lo scroll (se supportato)
    if (typeof el.focus === "function") {
      try {
        el.focus({ preventScroll: true });
      } catch {
        el.focus();
      }
    }

    ui.consumeScrollToBlockRequest(blockId);
  },
  { flush: "post" },
);
</script>

<template>
  <div class="pointer-catcher" @pointerdown.capture="onPagePointerDown">
    <div class="page" ref="page">
      <div class="lane">
        <!-- TITLE -->
        <div class="title-row" v-if="currentPageId">
          <div class="gutter" aria-hidden="true"></div>
          <div class="content">
            <input
              ref="titleInputEl"
              class="page-title-input"
              :class="{ muted: isUntitled }"
              :value="titleValueForInput"
              @focus="onTitleFocus"
              @blur="onTitleBlur"
              @keydown="onTitleKeydown"
              @input="onTitleInput"
              @mousedown="onTitleMouseDown"
              placeholder="Untitled"
            />
          </div>
        </div>

        <!-- BLOCKS -->
        <div class="block-list-wrap">
          <div ref="blockListEl" class="block-list">
            <DndController
              :tree="localTree"
              :overlay-inset-left="48"
              :can-drop-inside="({ target }) => target?.type !== 'code'"
              @addChildToggle="onCreateFirstToggleChild"
              @node-moved="handleMove"
            >
              <template #row="{ item, level, hasChildren, isExpanded }">
                <BlockRow
                  :block="item"
                  :level="level"
                  :pageId="id"
                  :parentKey="blocksStore.getParentKeyOf(item.parentId)"
                  :registerEditor="registerEditor"
                  :blockActionMenuId="overlayTopId"
                  :lastEmptyRootId="lastEmptyRootId"
                  :registerRowEl="registerRowEl"
                />
              </template>
            </DndController>
          </div>
          <div class="blank-catcher"></div>
        </div>
      </div>
    </div>
  </div>

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
          :editor="activeEditor"
          :type="activeType"
          @set-type="setBlockTypeFromToolbar"
        />
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.block-list-wrap {
  position: relative;
  grid-column: 1 / -1;
  min-height: 100vh;
  padding-left: 0px;
  padding-right: 0px;
}

.blank-catcher {
  position: absolute;
  inset: 0;
  z-index: 0;

  pointer-events: auto;
  /* metti rgba(...) solo per debug */
}

.block-list {
  position: relative;
  z-index: 1;
  padding-bottom: 400px;
  scroll-padding-bottom: 600px; /* blocchi sopra */
}

.page {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px;
  padding-left: 60px;
  padding-right: 80px;
}

/* Lane condivisa (titolo + blocchi) */
.lane {
  display: grid;
  grid-template-columns: var(--block-gutter) 1fr;
  column-gap: var(--block-gap);
}

/* Titolo usa la stessa griglia */
.title-row {
  grid-column: 1 / -1;
  display: contents;
}

.title-row > .content {
  padding: 0 var(--block-row-pad-x);
  margin-bottom: 6px;
}

.page-title-input {
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-main);
  font-size: 52px;
  font-weight: 700;
  line-height: 2;

  padding: 2px 0; /* evita clipping */
}

:deep(.block-item .row) {
  position: relative; /* anchor per ::before/::after */
  transition:
    background-color 140ms ease,
    transform 140ms ease;
  will-change: background-color, transform;
}

:deep(.block-item.drop-before),
:deep(.block-item.drop-after),
:deep(.block-item.drop-inside) {
  position: relative;
}

/*TOOLBAR*/
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

/* ============ INSIDE ============ */
:deep(.block-item.drop-inside .row)::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 10px;
  background: rgba(100, 150, 255, 0.08);
  pointer-events: none;

  opacity: 0;
  transform: scale(0.985);
  transition:
    opacity 120ms ease,
    transform 120ms ease;
  will-change: opacity, transform;
}

:deep(.block-item.drop-inside .row)::after {
  opacity: 1;
  transform: scale(1);
}

/* ============ BEFORE / AFTER LINE ============ */
:deep(.block-item.drop-before .row)::before,
:deep(.block-item.drop-after .row)::after {
  content: "";
  position: absolute;
  left: 2px;
  right: 2px;
  height: 2px;
  border-radius: 2px;
  pointer-events: none;

  background: rgba(100, 150, 255, 0.75);
  box-shadow: 0 0 0 1px rgba(100, 150, 255, 0.18); /* glow soft */

  opacity: 0;
  transform: scaleX(0.96);
  transition:
    opacity 120ms ease,
    transform 120ms ease;
  will-change: opacity, transform;
}

:deep(.block-item.drop-before .row)::before {
  top: -4px;
  opacity: 1;
  transform: scaleX(1);
}

:deep(.block-item.drop-after .row)::after {
  bottom: -4px;
  opacity: 1;
  transform: scaleX(1);
}

:deep(.block-item.drop-inside .row),
:deep(.block-item.drop-before .row),
:deep(.block-item.drop-after .row) {
  transform: translateY(-1px);
}

.page-title-input.muted {
  opacity: 0.45;
}

.code-surface {
  position: relative;
}

.code-placeholder {
  position: absolute;
  top: 10px; /* allinea al padding che hai */
  left: 12px;
  opacity: 0.45;
  pointer-events: none;
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
    monospace;
  line-height: 1.6em;
}
</style>
