<script setup>
import { computed, nextTick, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import usePagesStore from '@/stores/pages'
import PageTitlePopover from '@/components/shell/PageTitlePopover.vue'
import PageActionsController from '@/components/PageActionsController.vue'
import PageTitlePopoverController from '@/components/PageTitlePopoverController.vue'
import { getIconComponent } from '@/icons/catalog'

const ui = useUiStore()
const pagesStore = usePagesStore()
const { currentPageId } = storeToRefs(pagesStore)

const isHidden = computed(() => ui.sidebarMode === 'hidden')
const pageTitle = computed(() => pagesStore.pagesById[currentPageId.value]?.title || 'Untitled')
//const pageIcon = computed(() => pagesStore.pagesById[currentPageId.value]?.icon || '📄')
 const pageIcon = computed(() => getIconComponent(pagesStore.pagesById[currentPageId.value]?.icon))

// ===== Title Popover =====
const titleBtnEl = ref(null)
const pageTitlePopoverRef = ref(null)

const pageId = computed(() => currentPageId.value ?? null)

function openTitlePopover() {
  if (!currentPageId.value) return
  pageTitlePopoverRef.value?.open?.()
}

function openDocked() {
  ui.setSidebarMode('docked')
}

// ===== Page Actions Controller integration =====
const menuBtnEl = ref(null)
const actionsRef = ref(null)

function togglePageMenu() {
  actionsRef.value?.toggle?.()
}

function onRenameFromMenu() {
  openTitlePopover()
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
        <component class="title-icon":is="pageIcon" :size="18" />
        <span class="title-text">{{ pageTitle }}</span>
      </button>
    </div>

    <!-- RIGHT -->
    <div class="right">
      <button class="icon-btn" type="button" disabled title="Share (coming soon)">⤴︎</button>
      <button class="icon-btn" type="button" disabled title="Favorite (coming soon)">☆</button>

      <button
        ref="menuBtnEl"
        class="icon-btn"
        type="button"
        aria-label="Page options"
        title="Page options"
        @click="togglePageMenu"
      >
        ⋯
      </button>

      <!-- Smart controller (no UI itself, it teleports its menus to body) -->
      <PageActionsController
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
      anchorLocation="sidebar" 
      
      />
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

  border: 0px solid rgba(0, 0, 0, 0.12);
  background: rgba(255, 255, 255, 0.55);
  cursor: pointer;
  display: grid;
  place-items: center;
  font-size: 16px;
  line-height: 1;
}

.icon-btn:hover {
  background: var(--bar-btn-color);
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
  background: rgba(255, 255, 255, 0.45);
  padding: 0 10px;
  cursor: pointer;

  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.title-btn:hover {
  background: var(--bar-btn-color);
}

.title-icon {
  width: 18px;
  text-align: center;
  font-size: 14px;
  line-height: 1;
  opacity: 0.85;
}

.title-text {
  font-size: 13px;
  font-weight: 650;
  color: rgba(0, 0, 0, 0.72);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
 