<script setup>
import { computed, nextTick, ref } from "vue";
import { storeToRefs } from "pinia";
import { useUiStore } from "@/stores/ui";
import usePagesStore from "@/stores/pages";
import FavoriteButton from "@/components/FavoriteButton.vue";
import PageActionsController from "@/components/PageActionsController.vue";
import PageTitlePopoverController from "@/components/PageTitlePopoverController.vue";
import { getIconComponent } from "@/icons/catalog";
import { anchorKind, anchorKey } from "@/ui/anchorsKeyBind";

import { useRegisterAnchors } from "@/composables/useRegisterAnchors";
import { useUIOverlayStore } from "@/stores/uioverlay";
import { useAppActions } from "@/actions/useAppActions";

const ui = useUiStore();
const pagesStore = usePagesStore();
const uiOverlay = useUIOverlayStore();
const actions = useAppActions();
const { currentPageId } = storeToRefs(pagesStore);

const isHidden = computed(() => ui.sidebarMode === "hidden");
const pageTitle = computed(
  () => pagesStore.pagesById[currentPageId.value]?.title || "Untitled",
);
//const pageIcon = computed(() => pagesStore.pagesById[currentPageId.value]?.icon || '📄')
const pageIcon = computed(() =>
  getIconComponent(pagesStore.pagesById[currentPageId.value]?.icon),
);

const isFavorite = computed(() => {
  const page = pagesStore.pagesById[currentPageId.value];
  return page ? page.favorite : false;
});
// ===== Title Popover =====
const titleBtnEl = ref(null);
const dotsEl = ref(null);

const pageId = computed(() => currentPageId.value ?? null);

const kind_title = anchorKind("page", "title", "topbar", "pageTitle");

const key_title = anchorKey(kind_title, currentPageId.value);
const key_dots = anchorKey(
  anchorKind("page", "dots", "topbar", "pageMenu"),
  currentPageId.value,
);

useRegisterAnchors({
  [key_title]: titleBtnEl,
  [key_dots]: dotsEl,
});

/*
function openTitlePopover() {
  if (!currentPageId.value) return
  pageTitlePopoverRef.value?.open?.()
}*/
function openTitlePopover() {
  uiOverlay.requestOpen({
    menuId: "page.titlePopover",
    anchorKey: key_title,
    payload: {
      pageId: currentPageId.value,
    },
  });
}

function openPageActions() {
  uiOverlay.requestOpen({
    menuId: "page.actions",
    anchorKey: key_dots,
    payload: {
      pageId: currentPageId.value,
      placement: "bottom-end",
    },
  });
}

function openDocked() {
  ui.setSidebarMode("docked");
}

// ===== Page Actions Controller integration =====

function handleToggleFavorite() {
  actions.pages.toggleFavoritePage(currentPageId.value);
}
</script>

<template>
  <header class="topbar">
    <!-- LEFT -->
    <div class="left">
      <button
        v-if="isHidden"
        class="icon-btn"
        type="button"
        aria-label="Open sidebar"
        title="Open sidebar"
        @click="openDocked"
      >
        ›
      </button>

      <button
        ref="titleBtnEl"
        class="title-btn"
        type="button"
        :title="pageTitle"
        @click="openTitlePopover"
      >
        <!--<span class="title-icon">{{ pageIcon }}</span>-->
        <component class="title-icon" :is="pageIcon" :size="18" />
        <span class="title-text">{{ pageTitle }}</span>
      </button>
    </div>

    <!-- RIGHT -->
    <div class="right">
      <!--  <button class="icon-btn" type="button"  title="Mode (coming soon)" @click="handleToggleMode">*</button>-->
      <button
        class="icon-btn"
        type="button"
        disabled
        title="Share (coming soon)"
      >
        ⤴︎
      </button>
      <!-- <button class="icon-btn" type="button"   title="Favorite" @click="handleToggleFavorite"  >☆</button>-->
      <FavoriteButton
        :is-favorite="isFavorite"
        @toggle="handleToggleFavorite"
      />

      <button
        ref="dotsEl"
        class="icon-btn"
        type="button"
        aria-label="Page options"
        title="Page options"
        @click="openPageActions"
      >
        ⋯
      </button>

      <!--<PageActionsController
        ref="actionsRef"
        :anchorEl="menuBtnEl"
        :pageId="currentPageId"
        placement="bottom-end"
        :lockScrollOnOpen="true"
        @rename="onRenameFromMenu"
      />
      <PageTitlePopoverController
      v-if="currentPageId"
      ref="pageTitlePopoverRef"
      :pageId="currentPageId"
      :anchorEl="titleBtnEl"
      :lockScrollOnOpen="true" 
      anchorLocation="topbar" 
      
      />-->
    </div>
  </header>
</template>

<style scoped>
.topbar {
  height: var(--bar-h);
  padding: 0 var(--bar-px);
  gap: var(--bar-gap);
  background: transparent;
  flex: 0 0 auto;
  padding-top: var(--bar-pad);

  display: flex;
  align-items: center;
  justify-content: space-between;
}

.left,
.right {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.icon-btn {
  height: 34px;
  width: 34px;
  border-radius: var(--bar-radius);
  color: var(--icon-main);
  border: 0px solid rgba(0, 0, 0, 0.12);
  background: var(--bg-icon-transp);
  cursor: pointer;
  display: grid;
  place-items: center;
  font-size: 16px;
  line-height: 1;
}

.icon-btn:hover {
  background: var(--bg-bar-btn-hover);
}

.icon-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.title-btn {
  height: 34px;
  max-width: 520px;
  border-radius: 10px;
  border: 0px solid rgba(0, 0, 0, 0.1);
  background: var(--bg-icon-transp);
  padding: 0 10px;
  cursor: pointer;

  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.title-btn:hover {
  background: var(--bg-bar-btn-hover);
}

.title-icon {
  width: 18px;
  text-align: center;
  font-size: 14px;
  line-height: 1;
  opacity: 0.85;
  color: var(--icon-main);
}

.title-text {
  font-size: 13px;
  font-weight: 650;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
