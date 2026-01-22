<script setup lang="ts">
import PageTitlePopoverController from "@/components/PageTitlePopoverController.vue";
import { ref, onMounted, onBeforeUnmount, onUnmounted, nextTick } from "vue";
import { useUIOverlayStore } from "@/stores/uioverlay";
import PageActionsController from "@/components/PageActionsController.vue";
import BlockMenuController from "@/components/BlockMenuController.vue";
import CodeLanguageMenuController from "@/components/CodeLanguageMenuController.vue";
import MoveDestinationController from "@/components/menu/popover/MoveToDestinationController.vue";

import { useBlocksStore } from "@/stores/blocks";

const pageTitlePopoverRef = ref<any>(null);

const uiOverlay = useUIOverlayStore();
const blocksStore = useBlocksStore();

//let unregister: null | (() => void) = null

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

//===BLOCK MENU====
const blockMenuRef = ref<any>(null);
const blockMenuPayload = ref<any>(null);
async function openBlockMenu(req: {
  menuId: string;
  anchorKey: string;
  payload?: any;
}) {
  console.log("Opening block menu from OverlayHost.vue", req);
  blockMenuPayload.value = {
    pageId: blocksStore.blocksById[req.payload?.blockId]?.pageId,
    blockId: req.payload?.blockId,
    anchorKey: req.anchorKey,
    placement: req.payload?.placement || "right",
  };
  await nextTick();
  blockMenuRef.value?.open?.();
}
function closeBlockMenu() {
  blockMenuRef.value?.close?.();
}
const unregisterBlockMenu = uiOverlay.registerMenu({
  menuId: "block.menu",
  open: openBlockMenu,
  close: closeBlockMenu,
});
onUnmounted(() => unregisterBlockMenu?.());

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
  const disabled = collectDescendantsIds(pagesStore, pageId); // Set<string>
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
    await blocksStore.transferSubtreeToPage({
      fromPageId: p.fromPageId,
      toPageId: String(targetPageId),
      rootId: p.blockId,
      toParentId: null,
      afterBlockId: null,
    });
  } else if (p.mode === "page") {
    await pagesStore.movePage({
      pageId: p.pageId,
      newParentId: targetPageId,
    });
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
    <BlockMenuController
      ref="blockMenuRef"
      :pageId="blockMenuPayload?.pageId"
      :blockId="blockMenuPayload?.blockId"
      :anchorKey="blockMenuPayload?.anchorKey"
      anchorLocation="blockRow"
      :placement="blockMenuPayload?.placement"
      :sideOffsetX="0"
      :lockScrollOnOpen="true"
      :enableMoveTo="false"
      :enableDuplicate="false"
      :enableCopyLink="false"
      :enableComment="false"
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
  </Teleport>
</template>

<style scoped></style>
