<script setup>
import { computed, nextTick, onBeforeUnmount, ref, unref, watch } from 'vue'
import router from '@/router'
import usePagesStore from '@/stores/pages'
import useLiveAnchorRect from '@/composables/useLiveAnchorRect'

import ActionMenuDB from '@/components/ActionMenuDB.vue'
import { useOverlayLayer } from '@/composables/useOverlayLayer' 
import { getIconComponent } from '@/icons/catalog'

const props = defineProps({
  pageId: { type: [String, Number], default: null },
  anchorEl: { type: [Object, null], default: null }, // HTMLElement | ref
  placement: { type: String, default: 'bottom-end' },
  minWidthDelete: { type: Number, default: 320 },
  lockScrollOnOpen: { type: Boolean, default: false },
  anchorLocation: {type: String, default: ''},
})

const emit = defineEmits(['rename', 'deleted', 'duplicated', 'moved', 'close'])

const pagesStore = usePagesStore()

// open states
const rectTriggerOpen = ref(false)
const menuOpen = ref(false)
const moveOpen = ref(false)
const delOpen = ref(false)
const keepChildren = ref(true)

const anyOpen = computed(() => menuOpen.value || moveOpen.value || delOpen.value || rectTriggerOpen.value )

// anchor rect live (wrapper responsibility)
const anchorResolved = computed(() => unref(props.anchorEl) ?? null)
const { anchorRect, scheduleUpdate, updateNow } = useLiveAnchorRect(anchorResolved, anyOpen)

// expose methods
/*async function open() {
  
  if (!props.pageId) return
  //rectTriggerOpen.value=true;
  //anchorRect.value = anchorResolved.value.getBoundingClientRect().toJSON()
  console.log("PAGEACTIONS_rect", anchorRect.value,"anchorEl:", anchorResolved.value)
  
  //updateNow()
  await nextTick()
  menuOpen.value = true
  console.log("PAGEACTIONS_rect", anchorRect.value,"anchorEl:", anchorResolved.value)
  scheduleUpdate()
  await nextTick()
  scheduleUpdate()
}*/
async function open() {
  if (!props.pageId) return

  // 1) attiva solo il calcolo del rect (menu ancora chiuso)
  rectTriggerOpen.value = true
  await nextTick()
  updateNow()

  // 2) aspetta un frame per stabilizzare layout/scroll
  await new Promise(requestAnimationFrame)
  updateNow()

  // se ancora null, prova un ultimo giro (opzionale ma utile)
  if (!anchorRect.value) {
    scheduleUpdate()
    await new Promise(requestAnimationFrame)
  }

  // 3) ora apri il menu (rect dovrebbe essere pronto)
  menuOpen.value = true
  rectTriggerOpen.value = false
}


function close() {
  rectTriggerOpen.value = false
  menuOpen.value = false
  moveOpen.value = false
  delOpen.value = false
  emit('close')
}
function toggle() {
  anyOpen.value ? close() : open()
}

defineExpose({ open, close, toggle })

watch(anyOpen, (v) => {
  if (!v) return
  console.log('[PageActions] anchorResolved on open:', anchorResolved.value)
})


//DOM Refs
const mainMenuRef = ref(null)
const moveMenuRef = ref(null)
const delMenuRef = ref(null)

const activeMenuEl = computed(() => {
  if (menuOpen.value) return mainMenuRef.value?.el?.value ?? null
  if (moveOpen.value) return moveMenuRef.value?.el?.value ?? null
  if (delOpen.value) return delMenuRef.value?.el?.value ?? null
  return null
})

//====OVERLAY LAYER STACK====
const layerId = computed(() => (props.pageId ? `${props.anchorLocation}:page-actions:${props.pageId}` : null))

const { syncOpen } = useOverlayLayer(
  // id dinamico: se cambia pageId, chiudi e riapri layer
  layerId,
  () => ({
    getMenuEl: () => activeMenuEl.value,
    getAnchorEl: () => anchorResolved.value,
    close: close, // chiude main/move/del
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

// sincronizza quando anyOpen è true (e pageId esiste)
syncOpen(computed(() => !!layerId.value && anyOpen.value))




function closeMainOnly() {
  menuOpen.value = false
}


function openDeletePopover() {
  if (!props.pageId) return
  keepChildren.value = hasChildren.value
  delOpen.value = true
  nextTick(() => scheduleUpdate())
}

// menu items
const menuItems = computed(() => [
  { type: 'item', id: 'rename', label: 'Rename', icon: '✏️' },
  { type: 'item', id: 'duplicate', label: 'Duplicate', icon: '📄' },
  { type: 'separator' },
  { type: 'item', id: 'move', label: 'Move to…', icon: '📁' },
  { type: 'item', id: 'share', label: 'Share…', icon: '🔗', disabled: true },
  { type: 'separator' },
  { type: 'item', id: 'delete', label: 'Delete', icon: '🗑️', danger: true },
])

const moveItems = computed(() => {
  const curId = String(props.pageId ?? '')
  const rows = pagesStore.renderRowsPages ?? []

  const out = [
    { type: 'item', id: 'move:null', label: 'Workspace (root)', icon: '⬅️' },
    { type: 'separator' },
  ]

  for (const row of rows) {
    const pid = String(row.page?.id ?? '')
    if (!pid || pid === curId) continue

    let disabled = false
    try {
      disabled = pagesStore.wouldCreateCycle_Page?.(curId, pid) ?? false
    } catch (e) {
      console.error('[PageActions] wouldCreateCycle_Page failed', e)
    }

    const indent = row.level ? '—'.repeat(row.level) + ' ' : ''
    out.push({
      type: 'item',
      id: `move:${pid}`,
      label: `${indent}${row.page.title || 'Untitled'}`,
      icon: row.page.icon || '📄',
      disabled,
    })
  }

  return out
})

const hasChildren = computed(() => {
  try {
    const id = props.pageId
    if (!id) return false
    return (
      pagesStore.hasChildren?.(id) ??
      ((pagesStore.childrenByParentId?.[String(id)] ?? []).length > 0)
    )
  } catch (e) {
    console.error('[PageActions] hasChildren failed', e)
    return false
  }
})

// handlers
async function onMenuAction({ id }) {
  console.group('[PageActions] menu action:', id)
  try {
    if (!props.pageId) {
      close()
      return
    }

    if (id === 'rename') {
      close()
      emit('rename', props.pageId)
      return
    }

    if (id === 'duplicate') {
      close()
      try {
        const newId = await pagesStore.duplicatePageDeep(props.pageId)
        emit('duplicated', newId)
        router.push({ name: 'pageDetail', params: { id: newId } })
      } catch (e) {
        console.error('[PageActions] duplicatePageDeep failed', e)
      }
      return
    }

    if (id === 'move') {
      // IMPORTANT: chiudiamo solo il main, poi apriamo move
      closeMainOnly()
      openMoveMenu()
      return
    }

    if (id === 'delete') {
      closeMainOnly()
      openDeletePopover()
      return
    }

    close()
  } catch (e) {
    console.error('[PageActions] onMenuAction failed', e)
    close()
  } finally {
    console.groupEnd()
  }
}
//===MOVE TO====

const KEY_ROOT = 'root'
const parentKeyOf = (parentId) => parentId == null ? KEY_ROOT : String(parentId)



const expandedMove = ref(new Set()) // Set<string>

function isMoveExpanded(id) {
  return expandedMove.value.has(String(id))
}

function toggleMoveExpanded(id) {
  const k = String(id)
  const next = new Set(expandedMove.value)
  next.has(k) ? next.delete(k) : next.add(k)
  expandedMove.value = next
}

function openMoveMenu() {
  moveOpen.value = true

  try {
    const cur = String(props.pageId ?? '')
    const p = pagesStore.pagesById?.[cur]?.parentId ?? null
    if (p != null) {
      const next = new Set(expandedMove.value)
      next.add(String(p))
      expandedMove.value = next
    }
  } catch (e) {
    console.error('[MoveTo] auto-expand parent failed', e)
  }

  nextTick(() => scheduleUpdate())
}

const moveTreeRows = computed(() => {
  const curId = String(props.pageId ?? '')
  const rows = []

  const childIdsOf = (parentId) => {
    const key = parentId == null ? 'root' : String(parentId)
    return (pagesStore.childrenByParentId?.[key] ?? []).map(String)
  }

  const walk = (parentId, level) => {
    const kids = childIdsOf(parentId)
    for (const id of kids) {
      const page = pagesStore.pagesById?.[id]
      if (!page) continue

      const hasKids = childIdsOf(id).length > 0
      const self = id === curId

      let disabled = false
      try {
        disabled = pagesStore.wouldCreateCycle_Page?.(curId, id) ?? false
      } catch (e) {
        console.error('[MoveTo] wouldCreateCycle_Page failed', e)
      }

      rows.push({
        id,
        level,
        title: page.title || 'Untitled',
        icon: page.icon || '📄',
        hasKids,
        expanded: hasKids ? isMoveExpanded(id) : false,
        disabled: self || disabled,
      })

      if (hasKids && isMoveExpanded(id)) {
        walk(id, level + 1)
      }
    }
  }

  walk(null, 0)
  return rows
})

async function moveToParent(targetParentId) {
  if (!props.pageId) return
  try {
    await pagesStore.movePageToParentAppend(props.pageId, targetParentId)

   
    pagesStore.ensureVisible?.(props.pageId)

    emit('moved', { pageId: props.pageId, newParentId: targetParentId })
  } catch (e) {
    console.error('[MoveTo] movePageToParentAppend failed', e)
  } finally {
    close()
  }
}



//===DELETE ===
async function confirmDelete() {
  const id = props.pageId
  if (!id) return

  console.group('[PageActions] delete confirm')
  console.log('pageId:', id)

  try {
    const nextId = pagesStore.getNextPageIdAfterDelete?.(id)

    if (hasChildren.value && keepChildren.value) {
      try {
        await pagesStore.reparentChildrenToParent(id)
      } catch (e) {
        console.error('[PageActions] reparentChildrenToParent failed', e)
        throw e
      }
    }

    try {
      await pagesStore.deletePage(id)
    } catch (e) {
      console.error('[PageActions] deletePage failed', e)
      throw e
    }

    emit('deleted', id)
    close()

    if (nextId) router.push({ name: 'pageDetail', params: { id: nextId } })
    else router.push('/')
  } catch (e) {
    console.error('[PageActions] DELETE FLOW FAILED', e)
  } finally {
    console.groupEnd()
  }
}


</script>

<template>
  <Teleport to="body">
    <!-- MAIN MENU -->
    <ActionMenuDB
      ref="mainMenuRef"
      :open="menuOpen"
      :anchorRect="anchorRect"
      :anchorEl="anchorEl"
      :items="menuItems"
      :placement="placement"
      :closeOnAction="false"
      @action="onMenuAction"
      @close="close"
    />

    <!-- MOVE MENU -->
    <ActionMenuDB
    ref="moveMenuRef"
    :open="moveOpen"
    :anchorRect="anchorRect"
    :anchorEl="anchorEl"
    custom
    :minWidth="340"
    :placement="placement"
    @close="close"
    >
    <div class="move-pop">
        <div class="move-header">Move to…</div>

        <!-- Root -->
        <button class="move-row" type="button" @click="moveToParent(null)">
        <span class="caret-spacer"></span>
        <span class="icon">⬅️</span>
        <span class="label">Workspace (root)</span>
        </button>

        <div class="move-sep"></div>

        <!-- Tree rows -->
        <button
        v-for="r in moveTreeRows"
        :key="r.id"
        class="move-row"
        type="button"
        :disabled="r.disabled"
        :style="{ paddingLeft: `${10 + r.level * 14}px` }"
        @click="moveToParent(r.id)"
        >
        <span
            v-if="r.hasKids"
            class="caret"
            @click.stop="toggleMoveExpanded(r.id)"
            :title="r.expanded ? 'Collapse' : 'Expand'"
        >
            {{ r.expanded ? '▾' : '▸' }}
        </span>
        <span v-else class="caret-spacer"></span>

        <component :is="getIconComponent(r.icon)" :size="16" />
        <!--<span class="icon">{{ r.icon }}</span>-->
        <span class="label">{{ r.title }}</span>
        </button>
    </div>
    </ActionMenuDB>

    <!-- DELETE POPOVER -->
    <ActionMenuDB
       ref="delMenuRef"
      :open="delOpen"
      :anchorRect="anchorRect"
      :anchorEl="anchorEl"
      :custom="true"
      :minWidth="minWidthDelete"
      :placement="placement"
      @close="close"
    >
      <div class="del-pop">
        <div class="del-title">Delete page?</div>
        <div class="del-text">
          This will delete the page
          <span v-if="hasChildren"> and its subpages.</span>
        </div>

        <label v-if="hasChildren" class="del-check">
          <input type="checkbox" v-model="keepChildren" />
          Keep subpages (move to parent)
        </label>

        <div class="del-actions">
          <button class="btn-ghost" type="button" @click="close">Cancel</button>
          <button class="btn-ghost danger" type="button" @click="confirmDelete">Delete</button>
        </div>
      </div>
    </ActionMenuDB>
  </Teleport>
</template>

<style scoped>
.del-pop {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.del-title { font-weight: 700; font-size: 14px; }
.del-text { font-size: 13px; color: rgba(0,0,0,.7); }
.del-check { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.del-actions { display: flex; justify-content: flex-end; gap: 8px; }
.move-pop { padding: 6px; display: flex; flex-direction: column; gap: 4px; }
.move-header { font-weight: 700; font-size: 13px; padding: 6px 8px; }
.move-sep { height: 1px; background: rgba(0,0,0,.10); margin: 6px 6px; }

.move-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: transparent;
  border-radius: 10px;
  padding: 8px 10px;
  cursor: pointer;
  text-align: left;
}
.move-row:hover { background: rgba(0,0,0,.06); }
.move-row:disabled { opacity: .45; cursor: not-allowed; }

.caret { width: 16px; display: inline-flex; justify-content: center; }
.caret-spacer { width: 16px; display: inline-block; }
.icon { width: 22px; display: inline-flex; justify-content: center; }
.label { 
    font-size: 14px; 
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden; 
    text-overflow: ellipsis; 
    }
</style>