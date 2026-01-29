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
import LinkPopoverController from "@/components/LinkPopoverController.vue";
import HoverToolbarController from "@/components/menu/HoverToolbarController.vue";
import TrashMenuController from "@/components/menu/TrashMenuController.vue";
import SharePopoverController from "@/components/SharePopoverController.vue";
import BlockCommentPopoverController from "@/components/BlockCommentPopoverController.vue";

import { useHostMenu } from "@/composables/useHostMenu";
import CascadingHoverMenuController from "@/components/CascadingHoverMenuController.vue";

import { useAppActions } from "@/actions/useAppActions";
import { useTempAnchors } from "@/actions/tempAnchors.actions";
import { useDocActions } from "@/actions/doc.actions";
import { useEditorRegistryStore } from "@/stores/editorRegistry";

import type { MenuActionPayload } from "@/domain/menuActions";
import { useMenuActionDispatcher } from "@/composables/useMenuActionDispatcher";
import { anchorKey } from "@/ui/anchorsKeyBind";

const uiOverlay = useUIOverlayStore();
const actions = useAppActions();
const docActions = useDocActions();
const editorReg = useEditorRegistryStore();
const pagesStore = usePagesStore();
const tempAnchors = useTempAnchors();

function canCommentForPage(pageId?: string | number | null) {
  if (!pageId) return false;
  const role = pagesStore.pagesById?.[String(pageId)]?.role ?? null;
  return role === "owner" || role === "editor";
}

function canResolveForPage(pageId?: string | number | null) {
  if (!pageId) return false;
  const role = pagesStore.pagesById?.[String(pageId)]?.role ?? null;
  return role === "owner";
}
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
  const pageId = req.payload?.pageId ?? null;
  const docNodeId = req.payload?.docNodeId ?? null;
  const blockId = req.payload?.blockId ?? null;
  langMenuPayload.value = {
    pageId,
    docNodeId,
    blockId,
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
  moveDestPayload.value?.cleanup?.();
  const docNodeId = req.payload?.docNodeId ?? null;
  if (docNodeId) {
    const fromPageId = String(req.payload?.pageId ?? "");
    moveDestPayload.value = {
      mode: "doc",
      title: "Move block to…",
      anchorKey: req.anchorKey,
      currentPageId: fromPageId,
      disabledIds: [fromPageId],
      placement: req.payload?.placement ?? "left-start",
      docNodeId,
      fromPageId,
      cleanup: req.payload?.cleanup,
    };
  } else if (req.payload?.blockId && req.payload?.pageId) {
    const blockId = String(req.payload?.blockId);
    const fromPageId = String(req.payload?.pageId ?? "");
    moveDestPayload.value = {
      mode: "block",
      title: "Move block to…",
      anchorKey: req.anchorKey,
      currentPageId: fromPageId,
      disabledIds: [fromPageId],
      placement: req.payload?.placement ?? "left-start",
      blockId,
      fromPageId,
      cleanup: req.payload?.cleanup,
    };
  } else {
    return;
  }

  await nextTick();
  moveDestRef.value?.open?.();
}

function closeMoveBlock() {
  moveDestPayload.value?.cleanup?.();
  moveDestPayload.value = null;
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

  moveDestPayload.value?.cleanup?.();
  // calcola discendenti -> disabilitati per evitare cicli
  const disabled = pagesStore.collectDescendantsIds(
    pageId,
    pagesStore.childrenByParentId,
  ); // Set<string>
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
    cleanup: req.payload?.cleanup,
  };

  await nextTick();
  moveDestRef.value?.open?.();
}

function closeMovePage() {
  moveDestPayload.value?.cleanup?.();
  moveDestPayload.value = null;
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

  if (p.mode === "doc") {
    if (targetPageId === null) return;
    const fromPageId = p.fromPageId;
    const docNodeId = p.docNodeId;
    if (!fromPageId || !docNodeId) return;
    const rawId = String(docNodeId);
    let pos: number | null = null;
    if (rawId.startsWith("docnode:")) {
      const raw = rawId.slice("docnode:".length);
      const parsed = Number(raw);
      pos = Number.isFinite(parsed) ? parsed : null;
    } else {
      const ed = editorReg.getEditor(`doc:${fromPageId}`);
      if (ed?.state?.doc) {
        ed.state.doc.descendants((node: any, nodePos: number) => {
          if (node?.type?.name !== "draggableItem") return true;
          const itemId = node.attrs?.id != null ? String(node.attrs.id) : "";
          if (itemId && itemId === rawId) {
            pos = nodePos;
            return false;
          }
          return true;
        });
      }
    }
    if (typeof pos !== "number") return;
    await docActions.moveNodeToPage(fromPageId, targetPageId, pos);
  } else if (p.mode === "block") {
    if (targetPageId === null) return;
    //await actions.moveBlockTreeToPageAndFocus(p.blockId, targetPageId);
  } else if (p.mode === "page") {
    if (targetPageId === null) return;
    await actions.pages.movePageToParentAppend(p.pageId, targetPageId);
  }
}

const confirmRef = ref<InstanceType<typeof ConfirmPopoverController> | null>(
  null,
);
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
const linkPopoverPayload = ref<any>(null);
const linkPopoverOpen = ref(false);
const LINK_POPOVER_ID = "commons.linkPopover";

async function openLinkPopover(req: {
  menuId: string;
  anchorKey: string;
  payload?: any;
}) {
  linkPopoverPayload.value?.cleanup?.();
  linkPopoverPayload.value = {
    menuId: req.menuId,
    anchorKey: req.anchorKey,
    blockId: req.payload?.blockId,
    docKey: req.payload?.docKey,
    docNodeId: req.payload?.docNodeId,
    pageId: req.payload?.pageId,
    currentPageId: req.payload?.currentPageId ?? req.payload?.pageId,
    initialHref: req.payload?.initialHref,
    cleanup: req.payload?.cleanup,
  };
  linkPopoverOpen.value = true;
}

function closeLinkPopover() {
  linkPopoverPayload.value?.cleanup?.();
  linkPopoverPayload.value = null;
  linkPopoverOpen.value = false;
}

const unregLinkPopover = uiOverlay.registerMenu({
  menuId: LINK_POPOVER_ID,
  open: openLinkPopover,
  close: closeLinkPopover,
});
onUnmounted(() => unregLinkPopover?.());

// === TRASH MENU ===
const trashMenuPayload = ref<any>(null);
const trashMenuOpen = ref(false);
const TRASH_MENU_ID = "page.trashMenu";

async function openTrashMenu(req: {
  menuId: string;
  anchorKey: string;
  payload?: any;
}) {
  trashMenuPayload.value = {
    anchorKey: req.anchorKey,
    placement: req.payload?.placement ?? "right-start",
  };
  trashMenuOpen.value = true;
}

function closeTrashMenu() {
  trashMenuOpen.value = false;
  trashMenuPayload.value = null;
}

const unregTrashMenu = uiOverlay.registerMenu({
  menuId: TRASH_MENU_ID,
  open: openTrashMenu,
  close: closeTrashMenu,
});
onUnmounted(() => unregTrashMenu?.());

// === SHARE POPOVER ===
const shareRef = ref<any>(null);
const sharePayload = ref<any>(null);
const SHARE_MENU_ID = "page.share";

async function openShare(req: {
  menuId: string;
  anchorKey: string;
  payload?: any;
}) {
  sharePayload.value = {
    pageId: req.payload?.pageId,
    anchorKey: req.anchorKey,
    placement: req.payload?.placement ?? "bottom-end",
  };
  await nextTick();
  shareRef.value?.open?.();
}

function closeShare() {
  shareRef.value?.close?.();
}

const unregShareMenu = uiOverlay.registerMenu({
  menuId: SHARE_MENU_ID,
  open: openShare,
  close: closeShare,
});
onUnmounted(() => unregShareMenu?.());

// === STYLE MENU CONTROLLER ===
const STYLE_MENU_ID = "block.menu";
const styleMenuRef = ref<any>(null);
const styleMenuPayload = ref<any>(null);

async function openStyleMenu(req: {
  menuId: string;
  anchorKey: string;
  payload?: any;
}) {
  console.log("[DocMenu] overlay open", {
    menuId: req.menuId,
    anchorKey: req.anchorKey,
    docNodeId: req.payload?.docNodeId,
    pageId: req.payload?.pageId,
  });
  // payload semantico -> props del controller
  styleMenuPayload.value = {
    memuId: req.menuId,
    anchorKey: req.anchorKey,
    identityKey: String(
      req.payload?.docNodeId ??
        req.payload?.blockId ??
        req.payload?.pageId ??
        "",
    ),
    placement: req.payload?.placement ?? "right-start",
    blockId: req.payload?.blockId,
    pageId: req.payload?.pageId,
    docNodeId: req.payload?.docNodeId,
    enableComment: canCommentForPage(req.payload?.pageId ?? null),
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

const { dispatchMenuAction } = useMenuActionDispatcher();

async function onMenuAction(a: MenuActionPayload) {
  return dispatchMenuAction(a);
}

// === COMMENT POPOVER ===
const commentRef = ref<any>(null);
const commentPayload = ref<any>(null);
const COMMENT_MENU_ID = "block.comment";

async function openComment(req: {
  menuId: string;
  anchorKey: string;
  payload?: any;
}) {
  commentPayload.value?.cleanup?.();
  commentPayload.value = {
    pageId: req.payload?.pageId ?? null,
    docNodeId: req.payload?.docNodeId ?? null,
    anchorKey: req.anchorKey,
    placement: req.payload?.placement ?? "right-start",
    canComment: canCommentForPage(req.payload?.pageId ?? null),
    canResolve: canResolveForPage(req.payload?.pageId ?? null),
    cleanup: req.payload?.cleanup,
  };
  await nextTick();
  commentRef.value?.open?.();
}

function closeComment() {
  commentPayload.value?.cleanup?.();
  commentPayload.value = null;
  commentRef.value?.close?.();
}

const unregCommentMenu = uiOverlay.registerMenu({
  menuId: COMMENT_MENU_ID,
  open: openComment,
  close: closeComment,
});
onUnmounted(() => unregCommentMenu?.());
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
      :docNodeId="langMenuPayload?.docNodeId"
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
      :docNodeId="styleMenuPayload?.docNodeId || ''"
      :enableCopyLink="false"
      :enableComment="!!styleMenuPayload?.enableComment"
      @action="onMenuAction"
      @dismiss="onStyleMenuDismiss"
    />
    <BlockCommentPopoverController
      ref="commentRef"
      :pageId="commentPayload?.pageId || null"
      :docNodeId="commentPayload?.docNodeId || null"
      :anchorKey="commentPayload?.anchorKey || null"
      :placement="commentPayload?.placement || 'right-start'"
      :canComment="!!commentPayload?.canComment"
      :canResolve="!!commentPayload?.canResolve"
      :cleanup="commentPayload?.cleanup || null"
      :lockScrollOnOpen="false"
    />
    <LinkPopoverController
      :open="linkPopoverOpen"
      :blockId="linkPopoverPayload?.blockId || null"
      :docKey="linkPopoverPayload?.docKey || null"
      :docNodeId="linkPopoverPayload?.docNodeId || null"
      :currentPageId="linkPopoverPayload?.currentPageId || null"
      :anchorKey="linkPopoverPayload?.anchorKey || null"
      :initialHref="linkPopoverPayload?.initialHref || null"
    />
    <TrashMenuController
      :open="trashMenuOpen"
      :anchorKey="trashMenuPayload?.anchorKey || null"
      :placement="trashMenuPayload?.placement || 'right-start'"
    />
    <SharePopoverController
      ref="shareRef"
      :pageId="sharePayload?.pageId || null"
      :anchorKey="sharePayload?.anchorKey || null"
      :placement="sharePayload?.placement || 'bottom-end'"
      :lockScrollOnOpen="true"
      anchorLocation="overlay"
    />
    <HoverToolbarController />
  </Teleport>
</template>

<style scoped></style>
