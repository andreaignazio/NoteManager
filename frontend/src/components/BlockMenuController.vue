<script setup lang="ts">
import { computed, nextTick, ref, unref, watch } from "vue";
import { useOverlayLayer } from "@/composables/useOverlayLayer";
import useLiveAnchorRect from "@/composables/useLiveAnchorRect";
import { useBlocksStore } from "@/stores/blocks";
import { BLOCK_TYPES } from "@/domain/blockTypes";

import BlockMenuRootDB from "@/components/BlockMenuRootDB.vue";
import BlockTypeMenuDB from "@/components/BlockTypeMenuDB.vue";
import ActionMenuDB from "@/components/ActionMenuDB.vue";
import BlockColorMenuDB from "@/components/BlockColorMenuDB.vue";
import { styleForTextToken, styleForBgToken } from "@/theme/colorsCatalog";

import MoveToPageTreeMenuDB from "@/components/MoveToPageTreeMenuDB.vue";

import usePagesStore from "@/stores/pages";
import { useAnchorRegistryStore } from "@/stores/anchorRegistry";
import { useTempAnchors } from "@/actions/tempAnchors.actions";
const tempAnchors = useTempAnchors();
import { useUIOverlayStore } from "@/stores/uioverlay";
const uiOverlay = useUIOverlayStore();
import { useOverlayBinding } from "@/composables/useOverlayBinding";
import { useOverlayBindingKeyed } from "@/composables/useOverlayBindingKeyed";
const pagesStore = usePagesStore();

import {
  TEXT_TOKENS,
  BG_TOKENS,
  labelForTextToken,
  labelForBgToken,
} from "@/theme/colorsCatalog";
import { anchorKey } from "@/ui/anchorsKeyBind";

const props = defineProps({
  pageId: { type: [String, Number], required: true },
  blockId: { type: [String, Number], default: null },
  anchorEl: { type: [Object, null], default: null }, // HTMLElement | ref
  anchorKey: { type: String, default: null },

  placement: { type: String, default: "right" },
  sideOffsetX: { type: Number, default: -12 },
  lockScrollOnOpen: { type: Boolean, default: true },
  anchorLocation: { type: String, default: "blocks" },

  // feature flags
  enableMoveTo: { type: Boolean, default: false },
  enableDuplicate: { type: Boolean, default: false },
  enableCopyLink: { type: Boolean, default: false },
  enableComment: { type: Boolean, default: false },
});

const emit = defineEmits(["close"]);

const blocksStore = useBlocksStore();
const anchorsStore = useAnchorRegistryStore();

// open states
const rootOpen = ref(false);
const typeOpen = ref(false);
const colorOpen = ref(false);
const moveOpen = ref(false);
const anyOpen = computed(
  () => rootOpen.value || typeOpen.value || colorOpen.value || moveOpen.value,
);

// root anchor
//const anchorResolved = computed(() => unref(props.anchorEl) ?? null)
const anchorResolved = computed(() => {
  if (props.anchorKey) return anchorsStore.getAnchorEl(props.anchorKey);
  return unref(props.anchorEl) ?? null;
});
const { anchorRect: rootRect, scheduleUpdate: bumpRoot } = useLiveAnchorRect(
  anchorResolved as any,
  rootOpen,
);

// refs (dumb components expose menuRef->ActionMenuDB)
const rootCompRef = ref<any>(null);
const typeCompRef = ref<any>(null);
const colorMenuRef = ref<any>(null);
const moveMenuRef = ref<any>(null);

// DOM of root menu
const rootMenuEl = computed(
  () => rootCompRef.value?.menuRef?.value?.$el ?? null,
);
//const typeMenuEl = computed(() => typeCompRef.value?.menuRef?.value?.$el ?? null)
const typeMenuEl = computed(() => typeCompRef.value?.getMenuEl?.() ?? null);
const colorMenuEl = computed(() => colorMenuRef.value?.$el ?? null);
const moveMenuEl = computed(
  () => moveMenuRef.value?.getMenuEl?.() ?? moveMenuRef.value?.$el ?? null,
);

function getRootItemEl(id: string) {
  /*const el = rootMenuEl.value
  return el?.querySelector?.(`[data-menu-item-id="${id}"]`) ?? null*/
  return (rootCompRef.value as any)?.getItemElById?.(id) ?? null;
}

const typeAnchorEl = computed(() => getRootItemEl("submenu:type"));
const colorAnchorEl = computed(() => getRootItemEl("submenu:color"));
const moveAnchorEl = computed(() => getRootItemEl("move_to"));

const { anchorRect: typeRect, scheduleUpdate: bumpType } = useLiveAnchorRect(
  typeAnchorEl,
  typeOpen,
);
const { anchorRect: colorRect, scheduleUpdate: bumpColor } = useLiveAnchorRect(
  colorAnchorEl,
  colorOpen,
);
const { anchorRect: moveRect, scheduleUpdate: bumpMove } = useLiveAnchorRect(
  moveAnchorEl,
  moveOpen,
);

/// SUBMENU HOVER HANDLERS + TIMERS ///
const hoverTypeAnchor = ref(false);
const hoverTypeMenu = ref(false);
const hoverColorAnchor = ref(false);
const hoverColorMenu = ref(false);

let tType: number | null = null;
let tColor: number | null = null;

function clearTimer(which: "type" | "color") {
  if (which === "type" && tType != null) {
    clearTimeout(tType);
    tType = null;
  }
  if (which === "color" && tColor != null) {
    clearTimeout(tColor);
    tColor = null;
  }
}

function shouldKeepTypeOpen() {
  return hoverTypeAnchor.value || hoverTypeMenu.value;
}
function shouldKeepColorOpen() {
  return hoverColorAnchor.value || hoverColorMenu.value;
}

function scheduleCloseType(delay = 140) {
  clearTimer("type");
  tType = window.setTimeout(() => {
    if (!shouldKeepTypeOpen()) typeOpen.value = false;
    tType = null;
  }, delay) as any;
}

function scheduleCloseColor(delay = 140) {
  clearTimer("color");
  tColor = window.setTimeout(() => {
    if (!shouldKeepColorOpen()) colorOpen.value = false;
    tColor = null;
  }, delay) as any;
}

function openTypeHover() {
  if (!rootOpen.value) return;
  clearTimer("type");
  clearTimer("color"); // evita chiusure tardive
  hoverColorAnchor.value = false;
  hoverColorMenu.value = false;
  colorOpen.value = false;
  typeOpen.value = true;
  nextTick(() => bumpType());
}

function openColorHover() {
  if (!rootOpen.value) return;
  clearTimer("type");
  clearTimer("color"); // evita chiusure tardive
  hoverTypeAnchor.value = false;
  hoverTypeMenu.value = false;
  typeOpen.value = false;
  colorOpen.value = true;
  nextTick(() => bumpColor());
}

function onRootItemEnter(e: { id: string }) {
  if (e.id === "submenu:type") {
    hoverTypeAnchor.value = true;
    openTypeHover();
  }
  if (e.id === "submenu:color") {
    hoverColorAnchor.value = true;
    openColorHover();
  }
}

function onRootItemLeave(e: { id: string }) {
  if (e.id === "submenu:type") {
    hoverTypeAnchor.value = false;
    scheduleCloseType();
  }
  if (e.id === "submenu:color") {
    hoverColorAnchor.value = false;
    scheduleCloseColor();
  }
}

function bindHoverToMenu(
  getEl: () => HTMLElement | null,
  which: "type" | "color",
) {
  let el: HTMLElement | null = null;

  const enter = () => {
    if (which === "type") hoverTypeMenu.value = true;
    else hoverColorMenu.value = true;
    clearTimer(which);
  };

  const leave = () => {
    if (which === "type") hoverTypeMenu.value = false;
    else hoverColorMenu.value = false;
    if (which === "type") scheduleCloseType();
    else scheduleCloseColor();
  };

  const attach = () => {
    el = getEl();
    if (!el) return;
    el.addEventListener("pointerenter", enter);
    el.addEventListener("pointerleave", leave);
  };

  const detach = () => {
    if (!el) return;
    el.removeEventListener("pointerenter", enter);
    el.removeEventListener("pointerleave", leave);
    el = null;
  };

  return { attach, detach };
}

const typeHoverBinder = bindHoverToMenu(() => typeMenuEl.value, "type");
const colorHoverBinder = bindHoverToMenu(() => colorMenuEl.value, "color");

watch(typeOpen, async (v) => {
  typeHoverBinder.detach();
  hoverTypeMenu.value = false;
  if (!v) return;
  await nextTick();
  // doppio frame aiuta quando ActionMenu misura e poi rende visible
  await new Promise(requestAnimationFrame);
  typeHoverBinder.attach();
});

watch(colorOpen, async (v) => {
  colorHoverBinder.detach();
  hoverColorMenu.value = false;
  if (!v) return;
  await nextTick();
  await new Promise(requestAnimationFrame);
  colorHoverBinder.attach();
});

// overlay layer id
const layerId = computed(() => {
  if (!props.pageId || !props.blockId) return null;
  return `${props.anchorLocation}:block-menu:${props.pageId}:${props.blockId}`;
});

// topmost element for overlay
const activeMenuEl = computed(() => {
  if (moveOpen.value) return moveMenuEl.value;
  if (colorOpen.value) return colorMenuEl.value;
  if (typeOpen.value) return typeMenuEl.value;
  if (rootOpen.value) return rootMenuEl.value;
  return null;
});

function requestCloseTopmost() {
  console.log(
    "request close",
    "COLOR:",
    colorOpen.value,
    "TYPE:",
    typeOpen.value,
  );
  if (moveOpen.value) {
    moveOpen.value = false;
    return;
  }
  if (colorOpen.value) {
    colorOpen.value = false;
    return;
  }
  if (typeOpen.value) {
    typeOpen.value = false;
    return;
  }
  if (rootOpen.value) doCloseAll();
}

function doOpen() {
  if (!props.blockId) return;
  rootOpen.value = true;
  typeOpen.value = false;
  colorOpen.value = false;
  moveOpen.value = false;
  nextTick(() => bumpRoot());
}
function doCloseAll() {
  console.log("closemenu");
  rootOpen.value = false;
  typeOpen.value = false;
  colorOpen.value = false;
  moveOpen.value = false;
  emit("close");
}
function toggle() {
  anyOpen.value ? doCloseAll() : doOpen();
}

async function waitForRootItem(id: string, tries = 6) {
  for (let i = 0; i < tries; i++) {
    await nextTick();
    await new Promise(requestAnimationFrame);
    const el = getRootItemEl(id);
    if (el) return el;
  }
  return null;
}

defineExpose({ open: doOpen, close: doCloseAll, toggle });

const MENU_BASE = [
  {
    type: "item",
    id: "submenu:type",
    label: "Block style",
    iconId: "lucide:blocks",
    submenu: true,
  },
  {
    type: "item",
    id: "submenu:color",
    label: "Color",
    iconId: "lucide:palette",
    submenu: true,
  },
  { type: "separator" },
  {
    type: "item",
    id: "move_to",
    label: "Move to…",
    iconId: "lucide:folder-input",
    disabled: false,
  },
  {
    type: "item",
    id: "duplicate",
    label: "Duplicate",
    iconId: "lucide:copy",
    disabled: false,
  },
  {
    type: "item",
    id: "copy_link",
    label: "Copy link to block",
    iconId: "lucide:link",
    disabled: !props.enableCopyLink,
  },
  {
    type: "item",
    id: "comment",
    label: "Comment",
    iconId: "lucide:message-circle",
    disabled: !props.enableComment,
  },
  { type: "separator" },
  {
    type: "item",
    id: "delete",
    label: "Delete block",
    iconId: "lucide:trash-2",
    danger: true,
  },
];

const MENU_RULES = {
  code: { hide: ["submenu:color"] },
};

function compactSeparators(items: any[]) {
  const res: any[] = [];
  for (const it of items) {
    if (
      it.type === "separator" &&
      (res.length === 0 || res[res.length - 1].type === "separator")
    )
      continue;
    res.push(it);
  }
  while (res[res.length - 1]?.type === "separator") res.pop();
  return res;
}

const rootItems = computed(() => {
  const type = blocksStore.blocksById[props.blockId]?.type ?? "default";
  const hide = new Set((MENU_RULES as any)[type]?.hide ?? []);

  const filtered = MENU_BASE.filter(
    (it) => it.type === "separator" || !hide.has(it.id),
  );
  return compactSeparators(filtered);
});

// -------- TYPE MENU --------
const typeItems = computed(() => [
  ...BLOCK_TYPES.map((t: any) => ({
    type: "item",
    id: `type:${t.type}`,
    label: t.label,
    icon: t.icon,
    payload: { type: t.type },
  })),
]);

const activeTypeId = computed(() => {
  const id = props.blockId != null ? String(props.blockId) : null;
  if (!id) return null;
  const b = blocksStore.blocksById?.[id];
  return b?.type ? `type:${b.type}` : null;
});

async function openTypeMenu() {
  if (!rootOpen.value) return;
  // chiudi altri

  colorOpen.value = false;

  await nextTick();
  await new Promise(requestAnimationFrame);

  const anchor = getRootItemEl("submenu:type");
  console.log("rootMenuEl", rootMenuEl.value);
  console.log("type item", getRootItemEl("submenu:type"));
  console.log(
    "all items",
    rootMenuEl.value?.querySelectorAll?.("[data-menu-item-id]")?.length,
  );
  if (!anchor) return;

  typeOpen.value = true;
  await nextTick();

  bumpType();
}

async function openColorMenu() {
  if (!rootOpen.value) return;
  typeOpen.value = false;

  const el = await waitForRootItem("submenu:color");
  if (!el) return;

  colorOpen.value = true;
  await nextTick();
  bumpColor();
}

async function openMoveMenu() {
  if (!rootOpen.value) return;

  typeOpen.value = false;
  colorOpen.value = false;

  const el = await waitForRootItem("move_to");
  if (!el) return;

  moveOpen.value = true;
  await nextTick();
  bumpMove();
}

// -------- HANDLERS --------
async function onRootAction({ id }: { id: string }) {
  const blockId = props.blockId;
  if (!blockId) return doCloseAll();

  if (id === "submenu:type") {
    //await openTypeMenu();
    return;
  }
  if (id === "submenu:color") {
    //await openColorMenu();
    return;
  }

  if (id === "delete") {
    await blocksStore.deleteBlock(blockId, props.pageId);
    doCloseAll();
    return;
  }

  if (id === "move_to") {
    //await openMoveMenu()
    const tmpanchor = tempAnchors.registerViewportCenter();

    uiOverlay.requestOpen({
      menuId: "block.moveTo",
      anchorKey: tmpanchor.key,
      payload: {
        blockId: blockId,
        placement: "center",
      },
    });
    doCloseAll();
    return;
  }
  if (id === "duplicate") {
    try {
      await blocksStore.duplicateBlockInPlace(props.pageId, blockId);
    } catch (e) {
      console.error("Error duplicating block:", e);
    }
    doCloseAll();
    return;
  }

  // TODO: implement
  if (
    id === "move_to" ||
    id === "duplicate" ||
    id === "copy_link" ||
    id === "comment"
  ) {
    doCloseAll();
    return;
  }

  doCloseAll();
}

function onTypeAction({ id, payload }: { id: string; payload: any }) {
  const blockId = props.blockId;
  if (!blockId) return doCloseAll();

  if (id.startsWith("type:")) {
    blocksStore.updateBlockType(blockId, payload.type);
    doCloseAll();
    return;
  }
}

// -------- COLOR state + actions --------
const block = computed(() => {
  const id = props.blockId != null ? String(props.blockId) : null;
  return id ? (blocksStore.blocksById?.[id] ?? null) : null;
});

const currentText = computed(
  () => block.value?.props?.style?.textColor ?? "default",
);
const currentBg = computed(
  () => block.value?.props?.style?.bgColor ?? "default",
);

function setTextColor(token: string) {
  console.log("setColor", token);
  blocksStore.updateBlockStyle(props.blockId, { textColor: token });
  doCloseAll();
}
function setBgColor(token: string) {
  blocksStore.updateBlockStyle(props.blockId, { bgColor: token });
  doCloseAll();
}
// -------- OVERLAY LAYERS --------

function closeTypeMenu() {
  console.log("closeType");
  typeOpen.value = false;
}

const overlayId = "global:block-menu";

const identityKey = computed(() => {
  if (!props.pageId || !props.blockId) return null;
  return `${props.anchorLocation}:block-menu:${props.pageId}:${props.blockId}`;
});

useOverlayBindingKeyed(() => {
  // se non c'è contesto, non bindare
  if (!identityKey.value) return null;

  return {
    id: overlayId,
    kind: "dropdown",
    priority: 60,
    identityKey: identityKey.value,

    isOpen: () => anyOpen.value,

    getInteractionScope: () => "local",
    getMenuEl: () => activeMenuEl.value,
    getAnchorEl: () => anchorResolved.value as any,

    requestClose: requestCloseTopmost,

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

async function onMoveToSelect(toPageId: string | number) {
  await blocksStore.transferSubtreeToPage({
    fromPageId: props.pageId,
    toPageId,
    rootId: props.blockId,
    toParentId: null,
    afterBlockId: null,
  });
  doCloseAll();
}
</script>

<template>
  <Teleport to="body">
    <!-- ROOT -->
    <BlockMenuRootDB
      ref="rootCompRef"
      :open="rootOpen"
      :anchorRect="rootRect"
      :anchorEl="anchorEl"
      :items="rootItems"
      :placement="placement"
      :sideOffsetX="sideOffsetX"
      @item-enter="onRootItemEnter"
      @item-leave="onRootItemLeave"
      @action="onRootAction"
      @close="doCloseAll"
    />

    <!-- TYPE SUBMENU -->
    <BlockTypeMenuDB
      ref="typeCompRef"
      :open="typeOpen"
      :anchorRect="typeRect"
      :anchorEl="typeAnchorEl"
      :items="typeItems"
      :activeId="activeTypeId"
      placement="right-start"
      :sideOffsetX="0"
      @action="onTypeAction"
      @close="() => (typeOpen = false)"
    />

    <!-- COLOR SUBMENU (custom ActionMenu) -->
    <ActionMenuDB
      ref="colorMenuRef"
      :open="colorOpen"
      :anchorRect="colorRect"
      :anchorEl="colorAnchorEl"
      custom
      placement="right-start"
      :minWidth="280"
      :gap="6"
      :sideOffsetX="0"
      @close="() => (colorOpen = false)"
    >
      <BlockColorMenuDB
        :textTokens="TEXT_TOKENS"
        :bgTokens="BG_TOKENS"
        :currentText="currentText"
        :currentBg="currentBg"
        :labelForText="labelForTextToken"
        :labelForBg="labelForBgToken"
        :letterStyleForText="styleForTextToken"
        :swatchStyleForBg="styleForBgToken"
        @setText="setTextColor"
        @setBg="setBgColor"
        @close="() => (colorOpen = false)"
        @done="doCloseAll"
      />
    </ActionMenuDB>
    <!-- MOVE TO SUBMENU -->
    <MoveToPageTreeMenuDB
      ref="moveMenuRef"
      :open="moveOpen"
      :anchorRect="moveRect"
      :anchorEl="moveAnchorEl"
      :currentPageId="pageId"
      placement="left-start"
      :minWidth="340"
      :gap="6"
      :sideOffsetX="0"
      @select="onMoveToSelect"
      @close="() => (moveOpen = false)"
    />
  </Teleport>
</template>
