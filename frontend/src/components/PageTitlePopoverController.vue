<script setup>
import { computed, nextTick, onBeforeUnmount, ref, unref, watch, onMounted, onUnmounted } from 'vue'
import usePagesStore from '@/stores/pages'
import useLiveAnchorRect from '@/composables/useLiveAnchorRect'
import ActionMenuDB from '@/components/ActionMenuDB.vue'
import PageTitlePopoverDB from '@/components/PageTitlePopoverDB.vue'
import IconPickerDB from '@/components/IconPickerDB.vue'
import { useOverlayLayer } from '@/composables/useOverlayLayer'
import { ICONS } from "@/icons/catalog"

const props = defineProps({
  pageId: { type: [String, Number], default: null },
  anchorEl: { type: [Object, null], default: null }, // HTMLElement | ref

  // title popover positioning
  placement: { type: String, default: 'bottom-start' },
  minWidth: { type: Number, default: 320 },
  gap: { type: Number, default: 8 },
  sideOffsetX: { type: Number, default: 0 },

  // icon picker positioning
  iconPlacement: { type: String, default: 'right' },
  iconMinWidth: { type: Number, default: 320 },
  iconGap: { type: Number, default: 6 },
  iconSideOffsetX: { type: Number, default: 0 },
  lockScrollOnOpen: { type: Boolean, default: false },
  anchorLocation: {type: String, default: ''},
})

const emit = defineEmits(['close', 'commit'])

const pagesStore = usePagesStore()

const titleOpen = ref(false)
const iconOpen = ref(false)
const anyOpen = computed(() => titleOpen.value || iconOpen.value)

// --- anchor rect live: title ---
const titleAnchorResolved = computed(() => unref(props.anchorEl) ?? null)
const { anchorRect: titleAnchorRect, scheduleUpdate: bumpTitleRect } =
  useLiveAnchorRect(titleAnchorResolved, titleOpen)



//===OVERLAY REGISTER===
const titleMenuRef = ref(null)
const iconMenuRef = ref(null)

const activeMenuEl = computed(() => {
  if (iconOpen.value) return iconMenuRef.value?.el?.value ?? null
  if (titleOpen.value) return titleMenuRef.value?.el?.value ?? null
  return null
})

function requestCloseTopmost() {
  if (iconOpen.value) { closeIconPicker(); return }
  if (titleOpen.value) closeAll()
}

const layerId = computed(() => props.pageId ? `${props.anchorLocation}:page-title:${props.pageId}` : null)

const { syncOpen } = useOverlayLayer(
  layerId,
  () => ({
    getMenuEl: () => activeMenuEl.value,
    getAnchorEl: () => titleAnchorResolved.value,
    close: () => requestCloseTopmost(),
    options: {
      closeOnEsc: true,
      closeOnOutside: true,
      stopPointerOutside: true,
      lockScroll: !!props.lockScrollOnOpen,
      restoreFocus: true,
      allowAnchorClick: true,
    },
  })
)
//const test = computed(() => !!layerId.value && anyOpen.value)
syncOpen(computed(() => !!layerId.value && anyOpen.value))








// --- UI ref (DB): icon anchor + set icon ---
const titleUiRef = ref(null)
const iconAnchorResolved = computed(() => {
  const r = titleUiRef.value?.iconAnchorEl // ref<HTMLElement>
  return unref(r) ?? null
})

// --- anchor rect live: icon picker ---
const { anchorRect: iconAnchorRect, scheduleUpdate: bumpIconRect } =
  useLiveAnchorRect(iconAnchorResolved, iconOpen)



// --- page source ---
const page = computed(() => {
  const id = props.pageId != null ? String(props.pageId) : null
  if (!id) return null
  return pagesStore.pagesById?.[id] ?? null
})

//===OPEN/CLOSE===
function open() {
  
  if (!props.pageId) return
  titleOpen.value = true
  iconOpen.value = false
  nextTick(() => bumpTitleRect())
  
}

function closeIconPicker() {
  iconOpen.value = false
  nextTick(() => titleUiRef.value?.focusTitle?.())
}

function closeTitle() {
  titleOpen.value = false
  iconOpen.value = false
  emit('close')
}

function closeAll() {
  closeTitle()
}

function toggle() {
  titleOpen.value ? closeAll() : open()
}

defineExpose({ open, close: closeAll, toggle })

function openIconPicker() {
  if (!titleOpen.value) return
  iconOpen.value = true
  nextTick(() => bumpIconRect())
}

function onSelectIcon(icon) {
  try {
    titleUiRef.value?.setDraftIcon?.(icon)
  } catch (e) {
    console.error('[PageTitlePopover] setDraftIcon failed', e)
  } finally {
    closeIconPicker() 

    
  }
}


function onCancel() {
  closeAll()
}

async function onCommit({ icon, title }) {
  const p = page.value
  if (!p) return closeAll()

  const prevIcon = (p.icon ?? '') || ''
  const prevTitle = (p.title ?? '') || ''

  if (icon === prevIcon && title === prevTitle) {
    closeAll()
    return
  }

  // optimistic
  try { p.icon = icon; p.title = title } catch (e) { console.error('[PageTitlePopover] optimistic update failed', e) }

  console.group('[PageTitlePopover] commit')
  console.log('pageId:', p.id, 'icon:', icon, 'title:', title)

  try {
    await pagesStore.patchPage(p.id, { icon, title })
    emit('commit', { pageId: p.id, icon, title })
  } catch (e) {
    console.error('[PageTitlePopover] patchPage failed', e)
  } finally {
    console.groupEnd()
    closeAll()
  }
}


</script>

<template>
  <Teleport to="body">
    <!-- Title editor popover -->
    <ActionMenuDB
    ref="titleMenuRef"
      :open="titleOpen"
      :anchorRect="titleAnchorRect"
      :anchorEl="anchorEl"
      custom
      :placement="placement"
      :minWidth="minWidth"
      :gap="gap"
      :sideOffsetX="sideOffsetX"
      @close="closeAll"
    >
      <PageTitlePopoverDB
        ref="titleUiRef"
        :open="titleOpen"
        :initialIcon="page?.icon ?? ''"
        :initialTitle="page?.title ?? ''"
        placeholderTitle="Untitled"
        @commit="onCommit"
        @cancel="onCancel"
        @openIconPicker="openIconPicker"
      />
    </ActionMenuDB>

    <!-- Icon picker popover (layered) -->
    <ActionMenuDB
    ref="iconMenuRef"
      :open="iconOpen"
      :anchorRect="iconAnchorRect"
      :anchorEl="titleUiRef?.iconAnchorEl"
      custom
      :placement="iconPlacement"
      :minWidth="iconMinWidth"
      :gap="iconGap"
      :sideOffsetX="iconSideOffsetX"
      @close="closeIconPicker"
    >
      <IconPickerDB
        :icons="ICONS"
        @select="onSelectIcon"
        @close="closeIconPicker"  
      />
    </ActionMenuDB>
  </Teleport>
</template>