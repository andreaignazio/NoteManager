<script setup lang="ts">
import PageTitlePopoverController from '@/components/PageTitlePopoverController.vue'
import { ref, onMounted, onBeforeUnmount, onUnmounted, nextTick } from 'vue'
import { useUIOverlayStore } from '@/stores/uioverlay';
import PageActionsController from '@/components/PageActionsController.vue'
import BlockMenuController from '@/components/BlockMenuController.vue'
import CodeLanguageMenuController from '@/components/CodeLanguageMenuController.vue'

import {useBlocksStore} from '@/stores/blocks'

const pageTitlePopoverRef = ref<any>(null)



const uiOverlay = useUIOverlayStore()
const blocksStore = useBlocksStore()

//let unregister: null | (() => void) = null

const pageTitlePopoverPayload = ref<any>(null)
async function openPageTitlePopover(req: { menuId: string; anchorKey: string; payload?: any }) {
    console.log('Opening page title popover from OverlayHost.vue', req)
    pageTitlePopoverPayload.value = {
        pageId: req.payload?.pageId,
        anchorKey: req.anchorKey,
    }
     await nextTick()
    pageTitlePopoverRef.value?.open?.()
}

function closePageTitlePopover() {
  pageTitlePopoverRef.value?.close?.()
}


const unregister = uiOverlay.registerMenu({
  menuId: 'page.titlePopover',
  open: openPageTitlePopover,
  close: closePageTitlePopover,
})

onUnmounted(() => unregister?.())

//===PAGE ACTIONS MENU====
const pageActionsRef = ref<any>(null)
const pageActionsPayload = ref<any>(null)
async function openPageActions(req: { menuId: string; anchorKey: string; payload?: any }) {
    console.log('Opening page actions from OverlayHost.vue', req)
    pageActionsPayload.value = {
        pageId: req.payload?.pageId,
        anchorKey: req.anchorKey,
        placement: req.payload?.placement || 'right',
    }
     await nextTick()
    pageActionsRef.value?.open?.()
}
function closePageActions() {
  pageActionsRef.value?.close?.()
}

const unregisterActions = uiOverlay.registerMenu({
  menuId: 'page.actions',
  open: openPageActions,
  close: closePageActions,
})
onUnmounted(() => unregisterActions?.())

//===BLOCK MENU====
const blockMenuRef = ref<any>(null)
const blockMenuPayload = ref<any>(null)
async function openBlockMenu(req: { menuId: string; anchorKey: string; payload?: any }) {
    console.log('Opening block menu from OverlayHost.vue', req)
    blockMenuPayload.value = {
        pageId: blocksStore.blocksById[req.payload?.blockId]?.pageId,
        blockId: req.payload?.blockId,
        anchorKey: req.anchorKey,
        placement: req.payload?.placement || 'right',
    }
     await nextTick()
    blockMenuRef.value?.open?.()
}
function closeBlockMenu() {
  blockMenuRef.value?.close?.()
}
const unregisterBlockMenu = uiOverlay.registerMenu({
  menuId: 'block.menu',
  open: openBlockMenu,
  close: closeBlockMenu,
})
onUnmounted(() => unregisterBlockMenu?.())

//===CODE LANGUAGE MENU====
const langMenuRef = ref<any>(null)
const langMenuPayload = ref<any>(null)
async function openLangMenu(req: { menuId: string; anchorKey: string; payload?: any }) {
    console.log('Opening code language menu from OverlayHost.vue', req)
    langMenuPayload.value = {
        pageId: blocksStore.blocksById[req.payload?.blockId]?.pageId,
        blockId: req.payload?.blockId,
        anchorKey: req.anchorKey,
        placement: req.payload?.placement || 'bottom-end',
    }
     await nextTick()
    langMenuRef.value?.open?.()
}
function closeLangMenu() {
  langMenuRef.value?.close?.()
}
const unregisterLangMenu = uiOverlay.registerMenu({
  menuId: 'block.codeLanguageMenu',
  open: openLangMenu,
  close: closeLangMenu,
})
onUnmounted(() => unregisterLangMenu?.())

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
  </Teleport>
  </template>

  <style scoped>

  </style>