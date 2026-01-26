<script setup lang="ts">
import PageTitlePopoverController from "@/components/PageTitlePopoverController.vue";
import { ref, onMounted, onBeforeUnmount, onUnmounted, nextTick } from "vue";
import { useUIOverlayStore } from "@/stores/uioverlay";
import PageActionsController from "@/components/PageActionsController.vue";
import CodeLanguageMenuController from "@/components/CodeLanguageMenuController.vue";
import MoveDestinationController from "@/components/menu/popover/MoveToDestinationController.vue";
import ConfirmPopoverController from "@/components/ConfirmPopoverController.vue";
import { usePagesStore } from "@/stores/pages";
import MegaHoverMenuController from "@/components/menu/MegaHoverMenuController.vue";
import LinkPopover from "@/components/LinkPopover.vue";

import { useHostMenu } from "@/composables/useHostMenu";
import CascadingHoverMenuController from "@/components/CascadingHoverMenuController.vue";

import { useBlocksStore } from "@/stores/blocks";
import { useAppActions } from "@/actions/useAppActions";
import { useTempAnchors } from "@/actions/tempAnchors.actions";

import type { MenuActionPayload } from "@/domain/menuActions";
import { MENU_COMMANDS } from "@/domain/menuActions";
import { anchorKey } from "@/ui/anchorsKeyBind";

const uiOverlay = useUIOverlayStore();
const blocksStore = useBlocksStore();
const actions = useAppActions();
const pagesStore = usePagesStore();
const tempAnchors = useTempAnchors();
//let unregister: null | (() => void) = null
//===PAGE TITLE POPOVER====
const pageTitlePopoverRef = ref<any>(null);
const pageTitlePopoverPayload = ref<any>(null);
async function openPageTitlePopover(req: {
  menuId: string;
  anchorKey: string;
  payload?: any;
}) {
  console.log("Opening page title popover from OverlayHost.vue", req);
  pageTitlePopoverPayload.value = {
    pageId: req.payload?.pageId,
    anchorKey: req.anchorKey,
  };
  await nextTick();
  pageTitlePopoverRef.value?.open?.();
}

function closePageTitlePopover() {
  pageTitlePopoverRef.value?.close?.();
}

const unregister = uiOverlay.registerMenu({
  menuId: "page.titlePopover",
  open: openPageTitlePopover,
  close: closePageTitlePopover,
});

onUnmounted(() => unregister?.());

//===PAGE ACTIONS MENU====
const pageActionsRef = ref<any>(null);
const pageActionsPayload = ref<any>(null);
async function openPageActions(req: {
  menuId: string;
  anchorKey: string;
  payload?: any;
}) {
  console.log("Opening page actions from OverlayHost.vue", req);
  pageActionsPayload.value = {
    pageId: req.payload?.pageId,
    anchorKey: req.anchorKey,
    placement: req.payload?.placement || "right",
  };
  await nextTick();
  pageActionsRef.value?.open?.();
}
function closePageActions() {
  pageActionsRef.value?.close?.();
}

const unregisterActions = uiOverlay.registerMenu({
  menuId: "page.actions",
  open: openPageActions,
  close: closePageActions,
});
onUnmounted(() => unregisterActions?.());

//===CODE LANGUAGE MENU====
const langMenuRef = ref<any>(null);
const langMenuPayload = ref<any>(null);
async function openLangMenu(req: {
  menuId: string;
  anchorKey: string;
  payload?: any;
}) {
  console.log("Opening code language menu from OverlayHost.vue", req);
  langMenuPayload.value = {
    pageId: blocksStore.blocksById[req.payload?.blockId]?.pageId,
    blockId: req.payload?.blockId,
    anchorKey: req.anchorKey,
    placement: req.payload?.placement || "bottom-end",
  };
  await nextTick();
  langMenuRef.value?.open?.();
}
function closeLangMenu() {
  langMenuRef.value?.close?.();
}
const unregisterLangMenu = uiOverlay.registerMenu({
  menuId: "block.codeLanguageMenu",
  open: openLangMenu,
  close: closeLangMenu,
});
onUnmounted(() => unregisterLangMenu?.());

// === MOVE DESTINATION CONTROLLER ===
const moveDestRef = ref<any>(null);
const moveDestPayload = ref<any>(null);

// OPEN: blocco
async function openMoveBlock(req: {
  menuId: string;
  anchorKey: string;
  payload?: any;
}) {
  console.log("Opening move block menu from OverlayHost.vue", req);
  const blockId = String(req.payload?.blockId);
  const fromPageId = String(blocksStore.blocksById?.[blockId]?.pageId ?? "");

  moveDestPayload.value = {
    mode: "block",
    title: "Move block to…",
    anchorKey: req.anchorKey,
    currentPageId: fromPageId,
    disabledIds: [fromPageId], // opzionale: evita no-op
    placement: req.payload?.placement ?? "left-start",
    blockId,
    fromPageId,
  };

  await nextTick();
  moveDestRef.value?.open?.();
}

function closeMoveBlock() {
  moveDestRef.value?.close?.();
}

const unregisterMoveBlock = uiOverlay.registerMenu({
  menuId: "block.moveTo",
  open: openMoveBlock,
  close: closeMoveBlock,
});
onUnmounted(() => unregisterMoveBlock?.());

// OPEN: pagina (reparent)
async function openMovePage(req: {
  menuId: string;
  anchorKey: string;
  payload?: any;
}) {
  const pageId = String(req.payload?.pageId);

  // calcola discendenti -> disabilitati per evitare cicli
  const disabled = pagesStore.collectDescendantsIds(pagesStore, pageId); // Set<string>
  disabled.add(pageId);

  moveDestPayload.value = {
    mode: "page",
    title: "Move page under…",
    anchorKey: req.anchorKey,
    currentPageId: pageId, // disabilita se stesso già, ma qui lo mettiamo anche in disabled
    disabledIds: Array.from(disabled),
    allowRoot: true,
    rootLabel: "Top level",
    placement: req.payload?.placement ?? "left-start",
    pageId,
  };

  await nextTick();
  moveDestRef.value?.open?.();
}

function closeMovePage() {
  moveDestRef.value?.close?.();
}

const unregisterMovePage = uiOverlay.registerMenu({
  menuId: "page.moveTo",
  open: openMovePage,
  close: closeMovePage,
});
onUnmounted(() => unregisterMovePage?.());

async function onMoveDestSelect(targetPageId: string | null) {
  const p = moveDestPayload.value;
  if (!p) return;

  if (p.mode === "block") {
    if (targetPageId === null) return;
    await actions.moveBlockTreeToPageAndFocus(p.blockId, targetPageId);
  } else if (p.mode === "page") {
    if (targetPageId === null) return;
    await actions.pages.movePageToParentAppend(p.pageId, targetPageId);
  }
}

const confirmRef = ref(null);
const confirmPayload = ref<any>({});

async function openConfirm(req: {
  menuId: string;
  anchorKey: string;
  payload?: any;
}) {
  confirmPayload.value = {
    menuId: req.menuId, // 👈 fondamentale
    anchorKey: req.anchorKey,
    ...req.payload, // include __confirmToken
  };
  await nextTick();
  confirmRef.value?.open?.();
}

function closeConfirm() {
  confirmRef.value?.close?.();
}

const unregPageConfirm = uiOverlay.registerMenu({
  menuId: "page.deleteConfirm",
  open: openConfirm,
  close: closeConfirm,
});
const unregBlockConfirm = uiOverlay.registerMenu({
  menuId: "block.deleteConfirm",
  open: openConfirm,
  close: closeConfirm,
});
onUnmounted(() => {
  unregPageConfirm?.();
  unregBlockConfirm?.();
});

// === LINK POPOVER ===
const linkPopoverEl = ref<any>(null);
const linkPopoverPayload = ref<any>(null);
const LINK_POPOVER_ID = "commons.linkPopover";

async function openLinkPopover(req: {
  menuId: string;
  anchorKey: string;
  payload?: any;
}) {
  linkPopoverPayload.value = {
    memuId: req.menuId,
    anchorKey: req.anchorKey,
    blockId: req.payload?.blockId,
    pageId: req.payload?.pageId,
    anchorRect: req.payload?.anchorRect,
    initialHref: req.payload?.initialHref,
  };
  await nextTick();
  linkPopoverEl.value?.open?.();
}

// === STYLE MENU CONTROLLER ===
const STYLE_MENU_ID = "block.menu";
const styleMenuRef = ref<any>(null);
const styleMenuPayload = ref<any>(null);

async function openStyleMenu(req: {
  menuId: string;
  anchorKey: string;
  payload?: any;
}) {
  // payload semantico -> props del controller
  styleMenuPayload.value = {
    memuId: req.menuId,
    anchorKey: req.anchorKey,
    identityKey: String(req.payload?.blockId ?? req.payload?.pageId ?? ""), // scegli la tua identity
    placement: req.payload?.placement ?? "right-start",
    blockId: req.payload?.blockId,
    pageId: req.payload?.pageId,
    // startPanel: req.payload?.startPanel ?? "root", // opzionale
    // context: req.payload ?? {},                   // opzionale
  };

  await nextTick();
  styleMenuRef.value?.open?.(); // controller open()
}

function closeStyleMenu() {
  styleMenuRef.value?.close?.(); // controller close() (host-close silenziosa)
}

const unregStyleMenu = uiOverlay.registerMenu({
  menuId: STYLE_MENU_ID, // scegli id
  open: openStyleMenu,
  close: closeStyleMenu,
});

onUnmounted(() => unregStyleMenu?.());

// quando il controller chiude per click-outside (overlayStore), chiedi al semantico di chiudere
function onStyleMenuDismiss() {
  uiOverlay.requestClose?.(STYLE_MENU_ID); // o il metodo equivalente nel tuo store
}

const commandHandlers: Record<
  string,
  (a: MenuActionPayload & { type: "command" }) => any
> = {
  [MENU_COMMANDS.BLOCK_DUPLICATE]: async (a) => {
    const blockId = a.ctx.blockId;
    if (!blockId) return;

    await actions.blocks?.duplicateBlock?.(blockId);
  },
  [MENU_COMMANDS.BLOCK_DELETE]: async (a) => {
    const blockId = a.ctx.blockId;
    const pageId = a.ctx.pageId;

    const tmpanchor = tempAnchors.registerViewportCenter();
    try {
      if (!blockId || !pageId || !tmpanchor) return;
      await actions.blocks?.deleteBlockFlow?.({
        blockId,
        pageId,
        anchorKey: tmpanchor.key,
        placement: "center",
      });
    } finally {
      tmpanchor?.unregister();
    }
  },

  [MENU_COMMANDS.BLOCK_MOVE_TO_PAGE]: async (a) => {
    const blockId = a.ctx.blockId;
    if (!blockId) return;
    const tmpanchor = tempAnchors.registerViewportCenter();
    uiOverlay.requestOpen?.({
      menuId: "block.moveTo",
      anchorKey: tmpanchor!.key,
      payload: {
        blockId,
        placement: "center",
      },
    });
  },

  // (opzionale già pronto, non serve per test)
  [MENU_COMMANDS.BLOCK_APPLY_TYPE]: async (a) => {
    const blockId = a.ctx.blockId;
    if (!blockId) return;
    const blockType = a.payload?.blockType;
    if (!blockType) return;

    await actions.blocks?.setBlockType?.(blockId, blockType);
  },

  [MENU_COMMANDS.BLOCK_SET_TEXT_COLOR]: async (a) => {
    const blockId = a.ctx.blockId;
    if (!blockId) return;
    const colorToken = a.payload?.token;
    if (!colorToken) return;

    await actions.blocks?.setBlockTextColor?.(blockId, colorToken);
  },
  [MENU_COMMANDS.BLOCK_SET_BG_COLOR]: async (a) => {
    const blockId = a.ctx.blockId;
    if (!blockId) return;
    const colorToken = a.payload?.token;
    if (!colorToken) return;

    await actions.blocks?.setBlockBgColor?.(blockId, colorToken);
  },
  [MENU_COMMANDS.BLOCK_SET_FONT]: async (a) => {
    const blockId = a.ctx.blockId;
    if (!blockId) return;
    const fontId = a.payload?.fontId;
    if (!fontId) return;

    await actions.blocks?.setBlockFont?.(blockId, fontId);
  },
};

async function onMenuAction(a: MenuActionPayload) {
  if (a.type === "openMenu") {
    uiOverlay.requestOpen?.({
      menuId: a.menuId,
      anchorKey: a.anchorKey ?? a.ctx.anchorKey!,
      payload: a.payload,
    });
    return;
  }

  if (a.type === "navigate") {
    // router.push(a.to) ...
    return;
  }

  if (a.type === "command") {
    console.log("[OverlayHost] Menu command action:", a);
    const fn = commandHandlers[a.command];
    if (fn) return fn(a);
    console.warn("[OverlayHost] Unhandled menu command:", a.command, a);
  }
}
</script>

<template>
  <Teleport to="body">
    <PageTitlePopoverController
      ref="pageTitlePopoverRef"
      :pageId="pageTitlePopoverPayload?.pageId"
      :anchorKey="pageTitlePopoverPayload?.anchorKey"
      :lockScrollOnOpen="true"
      anchorLocation="sidebar"
    />
    <PageActionsController
      ref="pageActionsRef"
      :pageId="pageActionsPayload?.pageId"
      :anchorKey="pageActionsPayload?.anchorKey"
      :placement="pageActionsPayload?.placement"
      :lockScrollOnOpen="true"
      anchorLocation="sidebar"
      @rename="() => {}"
      @deleted="() => {}"
      @duplicated="() => {}"
      @moved="() => {}"
      @close="() => {}"
    />
    <CodeLanguageMenuController
      ref="langMenuRef"
      :pageId="langMenuPayload?.pageId"
      :blockId="langMenuPayload?.blockId"
      :anchorKey="langMenuPayload?.anchorKey"
      anchorLocation="blockRow"
      :placement="langMenuPayload?.placement"
      :lockScrollOnOpen="false"
    />
    <MoveDestinationController
      ref="moveDestRef"
      :anchorKey="moveDestPayload?.anchorKey"
      :title="moveDestPayload?.title"
      :currentPageId="moveDestPayload?.currentPageId"
      :disabledIds="moveDestPayload?.disabledIds"
      :allowRoot="moveDestPayload?.allowRoot"
      :placement="moveDestPayload?.placement || 'left-start'"
      :minWidth="moveDestPayload?.minWidth || 340"
      :gap="moveDestPayload?.gap || 6"
      :sideOffsetX="moveDestPayload?.sideOffsetX || 0"
      :lockScrollOnOpen="false"
      @select="onMoveDestSelect"
      @close="() => {}"
    />
    <ConfirmPopoverController
      ref="confirmRef"
      :anchorKey="confirmPayload?.anchorKey || ''"
      :menuId="confirmPayload?.menuId || ''"
      :payload="confirmPayload || {}"
      placement="center"
      @close="() => {}"
    />
    <!--<CascadingHoverMenuController
      ref="blockMenuRef"
      menuId="block.menu"
      :anchorKey="blockMenuPayload?.anchorKey"
      :identityKey="blockMenuPayload?.blockId"
      :placement="blockMenuPayload?.placement"
      :items="blockMenuPayload?.items"
      @dismiss="uiOverlay.requestClose('block.menu')"
    />-->
    <MegaHoverMenuController
      ref="styleMenuRef"
      :menuId="styleMenuPayload?.memuId || ''"
      :anchorKey="styleMenuPayload?.anchorKey || ''"
      :identityKey="styleMenuPayload?.identityKey || ''"
      :placement="styleMenuPayload?.placement || ''"
      :blockId="styleMenuPayload?.blockId || ''"
      :pageId="styleMenuPayload?.pageId || ''"
      :enableCopyLink="false"
      :enableComment="false"
      @action="onMenuAction"
      @dismiss="onStyleMenuDismiss"
    />
    <!--<LinkPopover
      ref="linkPopoverEl"
      :open="linkPopoverOpen"
      :blockId="linkPopoverState?.blockId"
      :currentPageId="linkPopoverState?.currentPageId"
      :anchorRect="linkPopoverState?.anchorRect"
      :initialHref="linkPopoverState?.initialHref"
    />-->
  </Teleport>
</template>

<style scoped></style>
