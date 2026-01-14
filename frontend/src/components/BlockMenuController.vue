<script setup>
import { computed, nextTick, ref, unref } from 'vue'
import { useOverlayLayer } from '@/composables/useOverlayLayer'
import useLiveAnchorRect from '@/composables/useLiveAnchorRect'
import { useBlocksStore } from '@/stores/blocks'
import { BLOCK_TYPES } from '@/domain/blockTypes'

import BlockMenuRootDB from '@/components/BlockMenuRootDB.vue'
import BlockTypeMenuDB from '@/components/BlockTypeMenuDB.vue'
import ActionMenuDB from '@/components/ActionMenuDB.vue'
import BlockColorMenuDB from '@/components/BlockColorMenuDB.vue'
import { styleForTextToken, styleForBgToken } from '@/theme/colorsCatalog'

import {
  TEXT_TOKENS,
  BG_TOKENS,
  labelForTextToken,
  labelForBgToken,
} from '@/theme/colorsCatalog'

const props = defineProps({
  pageId: { type: [String, Number], required: true },
  blockId: { type: [String, Number], default: null },
  anchorEl: { type: [Object, null], default: null }, // HTMLElement | ref

  placement: { type: String, default: 'right' },
  sideOffsetX: { type: Number, default: -12 },
  lockScrollOnOpen: { type: Boolean, default: true },
  anchorLocation: { type: String, default: 'blocks' },

  // feature flags
  enableMoveTo: { type: Boolean, default: false },
  enableDuplicate: { type: Boolean, default: false },
  enableCopyLink: { type: Boolean, default: false },
  enableComment: { type: Boolean, default: false },
})

const emit = defineEmits(['close'])

const blocksStore = useBlocksStore()

// open states
const rootOpen = ref(false)
const typeOpen = ref(false)
const colorOpen = ref(false)
const anyOpen = computed(() => rootOpen.value || typeOpen.value || colorOpen.value)

// root anchor
const anchorResolved = computed(() => unref(props.anchorEl) ?? null)
const { anchorRect: rootRect, scheduleUpdate: bumpRoot } = useLiveAnchorRect(anchorResolved, rootOpen)

// refs (dumb components expose menuRef->ActionMenuDB)
const rootCompRef = ref(null)
const typeCompRef = ref(null)
const colorMenuRef = ref(null)

// DOM of root menu
const rootMenuEl = computed(() => rootCompRef.value?.menuRef?.value?.$el ?? null)
//const typeMenuEl = computed(() => typeCompRef.value?.menuRef?.value?.$el ?? null)
const typeMenuEl = typeCompRef.value?.getMenuEl()
const colorMenuEl = computed(() => colorMenuRef.value?.$el ?? null)

function getRootItemEl(id) {
  /*const el = rootMenuEl.value
  return el?.querySelector?.(`[data-menu-item-id="${id}"]`) ?? null*/
  return rootCompRef.value?.getItemElById?.(id) ?? null
}

const typeAnchorEl = computed(() => getRootItemEl('submenu:type'))
const colorAnchorEl = computed(() => getRootItemEl('submenu:color'))

const { anchorRect: typeRect, scheduleUpdate: bumpType } = useLiveAnchorRect(typeAnchorEl, typeOpen)
const { anchorRect: colorRect, scheduleUpdate: bumpColor } = useLiveAnchorRect(colorAnchorEl, colorOpen)

// overlay layer id
const layerId = computed(() => {
  if (!props.pageId || !props.blockId) return null
  return `${props.anchorLocation}:block-menu:${props.pageId}:${props.blockId}`
})

// topmost element for overlay
const activeMenuEl = computed(() => {
  if (colorOpen.value) return colorMenuEl.value
  if (typeOpen.value) return typeMenuEl.value
  if (rootOpen.value) return rootMenuEl.value
  return null
})

function requestCloseTopmost() {
  console.log("request close","COLOR:",colorOpen.value,"TYPE:",typeOpen.value)
  if (colorOpen.value) { colorOpen.value = false; return }
  if (typeOpen.value) { typeOpen.value = false; return }
  if (rootOpen.value) doCloseAll()
}

function doOpen() {
  if (!props.blockId) return
  rootOpen.value = true
  typeOpen.value = false
  colorOpen.value = false
  nextTick(() => bumpRoot())
}
function doCloseAll() {
  console.log("closemenu")
  rootOpen.value = false
  typeOpen.value = false
  colorOpen.value = false
  emit('close')
}
function toggle() {
  anyOpen.value ? doCloseAll() : doOpen()
}

async function waitForRootItem(id, tries = 6) {
  for (let i = 0; i < tries; i++) {
    await nextTick()
    await new Promise(requestAnimationFrame)
    const el = getRootItemEl(id)
    if (el) return el
  }
  return null
}


defineExpose({ open: doOpen, close: doCloseAll, toggle })

// -------- ROOT ITEMS --------
const rootItems = computed(() => ([
  { type: 'item', id: 'submenu:type', label: 'Block type…', icon: '↪', submenu: true },
  { type: 'item', id: 'submenu:color', label: 'Color…', icon: '🎨', submenu: true },
  { type: 'separator' },
  { type: 'item', id: 'move_to', label: 'Move to…', icon: '📂', disabled: !props.enableMoveTo },
  { type: 'item', id: 'duplicate', label: 'Duplicate', icon: '📄', disabled: !props.enableDuplicate },
  { type: 'item', id: 'copy_link', label: 'Copy link to block', icon: '🔗', disabled: !props.enableCopyLink },
  { type: 'item', id: 'comment', label: 'Comment', icon: '💬', disabled: !props.enableComment },
  { type: 'separator' },
  { type: 'item', id: 'delete', label: 'Delete block', icon: '🗑️', danger: true },
]))

// -------- TYPE MENU --------
const typeItems = computed(() => ([
  ...BLOCK_TYPES.map(t => ({
    type: 'item',
    id: `type:${t.type}`,
    label: t.label,
    icon: t.icon,
    payload: { type: t.type },
  })),
]))

const activeTypeId = computed(() => {
  const id = props.blockId != null ? String(props.blockId) : null
  if (!id) return null
  const b = blocksStore.blocksById?.[id]
  return b?.type ? `type:${b.type}` : null
})

async function openTypeMenu() {
  if (!rootOpen.value) return
  // chiudi altri
  
  colorOpen.value = false

  await nextTick()
  await new Promise(requestAnimationFrame)

  const anchor = getRootItemEl('submenu:type')
  console.log('rootMenuEl', rootMenuEl.value)
  console.log('type item', getRootItemEl('submenu:type'))
  console.log('all items', rootMenuEl.value?.querySelectorAll?.('[data-menu-item-id]')?.length)
  if (!anchor) return

  typeOpen.value = true
  await nextTick()
  
  bumpType()
}

async function openColorMenu() {
  if (!rootOpen.value) return
  typeOpen.value = false

  const el = await waitForRootItem('submenu:color')
  if (!el) return

  colorOpen.value = true
  await nextTick()
  bumpColor()
}

// -------- HANDLERS --------
async function onRootAction({ id }) {
  const blockId = props.blockId
  if (!blockId) return doCloseAll()

  if (id === 'submenu:type') { await openTypeMenu(); return }
  if (id === 'submenu:color') { await openColorMenu(); return }

  if (id === 'delete') {
    await blocksStore.deleteBlock(blockId, props.pageId)
    doCloseAll()
    return
  }

  // TODO: implement
  if (id === 'move_to' || id === 'duplicate' || id === 'copy_link' || id === 'comment') {
    doCloseAll()
    return
  }

  doCloseAll()
}

function onTypeAction({ id, payload }) {
  const blockId = props.blockId
  if (!blockId) return doCloseAll()

  if (id.startsWith('type:')) {
    blocksStore.updateBlockType(blockId, payload.type)
    doCloseAll()
    return
  }
}

// -------- COLOR state + actions --------
const block = computed(() => {
  const id = props.blockId != null ? String(props.blockId) : null
  return id ? (blocksStore.blocksById?.[id] ?? null) : null 
})

const currentText = computed(() => block.value?.props?.style?.textColor ?? 'default')
const currentBg = computed(() => block.value?.props?.style?.bgColor ?? 'default')

function setTextColor(token) {
  console.log("setColor", token)
  blocksStore.updateBlockStyle(props.blockId, { textColor: token })
  doCloseAll()
}
function setBgColor(token) {
  blocksStore.updateBlockStyle(props.blockId, { bgColor: token })
  doCloseAll()
}

// overlay
/*const { syncOpen } = useOverlayLayer(layerId, () => ({
  getMenuEl: () => activeMenuEl.value,
  getAnchorEl: () => anchorResolved.value,
  close: requestCloseTopmost,
  options: {
    closeOnEsc: true,
    closeOnOutside: true,
    stopPointerOutside: true,
    lockScroll: !!props.lockScrollOnOpen,
    restoreFocus: true,
    allowAnchorClick: true,
  },
}))

syncOpen(computed(() => !!layerId.value && anyOpen.value))*/

const baseLayerId = computed(() => {
  if (!props.pageId || !props.blockId) return null
  return `${props.anchorLocation}:block-menu:${props.pageId}:${props.blockId}`
})

const rootLayerId  = computed(() => (baseLayerId.value ? `${baseLayerId.value}:root` : null))
const typeLayerId  = computed(() => (baseLayerId.value ? `${baseLayerId.value}:type` : null))
const colorLayerId = computed(() => (baseLayerId.value ? `${baseLayerId.value}:color` : null))

function closeTypeMenu() {
  console.log("closeType")
  typeOpen.value=false
}


const { syncOpen: syncRootOpen } = useOverlayLayer(rootLayerId, () => ({
  getMenuEl: () => rootCompRef.value?.getMenuEl?.() ?? null,         // oppure $el / ref che hai
  getAnchorEl: () => anchorResolved.value,
  close: () => doCloseAll(),
  options: {
    closeOnEsc: true,
    closeOnOutside: true,
    // IMPORTANT: quando ci sono submenu, NON bloccare i pointer fuori,
    // altrimenti impedisci interazioni utili con submenu/altro.
    stopPointerOutside: true,
    lockScroll: !!props.lockScrollOnOpen,
    restoreFocus: true,
    allowAnchorClick: true,
  },
}))
syncRootOpen(computed(() => !!rootLayerId.value && rootOpen.value))

const { syncOpen: syncTypeOpen } = useOverlayLayer(typeLayerId, () => ({
  getMenuEl: () => typeCompRef.value?.getMenuEl?.() ?? null,
  getAnchorEl: () => typeAnchorEl.value,
  close: closeTypeMenu,
  options: {
    closeOnEsc: true,
    closeOnOutside: true,
    // SUBMENU: non stoppare pointer fuori, altrimenti non puoi cliccare nel root
    stopPointerOutside: true,
    lockScroll: false,
    restoreFocus: false,
    allowAnchorClick: true,
  },
}))
syncTypeOpen(computed(() => !!typeLayerId.value && typeOpen.value))

const { syncOpen: syncColorOpen } = useOverlayLayer(colorLayerId, () => ({
  getMenuEl: () => colorMenuRef.value?.getMenuEl?.() ?? null,
  getAnchorEl: () => colorAnchorEl.value,
  close: () => { colorOpen.value = false },
  options: {
    closeOnEsc: true,
    closeOnOutside: true,
    stopPointerOutside: true,
    lockScroll: false,
    restoreFocus: false,
    allowAnchorClick: true,
  },
}))
syncColorOpen(computed(() => !!colorLayerId.value && colorOpen.value))

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
  </Teleport>
</template>
