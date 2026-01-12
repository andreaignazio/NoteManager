<script setup>
import { computed, nextTick, ref, unref } from 'vue'
import { useOverlayLayer } from '@/composables/useOverlayLayer'
import useLiveAnchorRect from '@/composables/useLiveAnchorRect'
import ActionMenuDB from '@/components/ActionMenuDB.vue'
import { BLOCK_TYPES } from '@/domain/blockTypes'
import { useBlocksStore } from '@/stores/blocks'

const props = defineProps({
  pageId: { type: [String, Number], required: true },
  blockId: { type: [String, Number], default: null },
  anchorEl: { type: [Object, null], default: null }, // HTMLElement | ref
  placement: { type: String, default: 'right' },     // come i tuoi menu
  sideOffsetX: { type: Number, default: -12 },
  lockScrollOnOpen: { type: Boolean, default: true },
  anchorLocation: { type: String, default: 'blocks' }, // per id
})

const emit = defineEmits(['close'])

const blocksStore = useBlocksStore()

const open = ref(false)

const anchorResolved = computed(() => unref(props.anchorEl) ?? null)
const { anchorRect, scheduleUpdate } = useLiveAnchorRect(anchorResolved, open)

const menuRef = ref(null)
const menuEl = computed(() => menuRef.value?.el?.value ?? null)

const layerId = computed(() => {
  if (!props.pageId || !props.blockId) return null
  return `${props.anchorLocation}:block-menu:${props.pageId}:${props.blockId}`
})

function doOpen() {
  if (!props.blockId) return
  open.value = true
  nextTick(() => scheduleUpdate())
}
function doClose() {
  open.value = false
  emit('close')
}
function toggle() {
  open.value ? doClose() : doOpen()
}

defineExpose({ open: doOpen, close: doClose, toggle })

// active item (block type)
const activeTypeId = computed(() => {
  const id = props.blockId != null ? String(props.blockId) : null
  if (!id) return null
  const b = blocksStore.blocksById?.[id]
  return b?.type ? `type:${b.type}` : null
})

const menuItems = computed(() => ([
  ...BLOCK_TYPES.map(t => ({
    type: 'item',
    id: `type:${t.type}`,
    label: t.label,
    icon: t.icon,
    payload: { type: t.type },
  })),
  { type: 'separator' },
  {
    type: 'item',
    id: 'delete',
    label: 'Delete block',
    icon: '🗑️',
    danger: true,
    payload: { blockId: props.blockId },
  },
]))

function onMenuAction({ id, payload }) {
  const blockId = props.blockId
  if (!blockId) return doClose()

  if (id.startsWith('type:')) {
    blocksStore.updateBlockType(blockId, payload.type)
    doClose()
    return
  }

  if (id === 'delete') {
    blocksStore.deleteBlock(payload.blockId, props.pageId)
    doClose()
    return
  }

  doClose()
}

// overlay layer
const { syncOpen } = useOverlayLayer(layerId, () => ({
  getMenuEl: () => menuEl.value,
  getAnchorEl: () => anchorResolved.value,
  close: () => doClose(),
  options: {
    closeOnEsc: true,
    closeOnOutside: true,
    stopPointerOutside: true,
    lockScroll: !!props.lockScrollOnOpen,
    restoreFocus: true,
    allowAnchorClick: true,
  },
}))

syncOpen(computed(() => !!layerId.value && open.value))
</script>

<template>
  <Teleport to="body">
    <ActionMenuDB
      ref="menuRef"
      :open="open"
      :anchorRect="anchorRect"
      :anchorEl="anchorEl"
      :items="menuItems"
      :activeId="activeTypeId"
      :sideOffsetX="sideOffsetX"
      :placement="placement"
      :closeOnAction="false"
      @action="onMenuAction"
      @close="doClose"
    />
  </Teleport>
</template>
