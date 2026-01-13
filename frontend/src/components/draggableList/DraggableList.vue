<script setup>
import { ref } from 'vue'
import RecursiveDraggable from '@/components/draggableList/RecursiveDraggable.vue'

const props = defineProps({
  items: { type: Array, required: true },
})

const emit = defineEmits(['intent-commit'])

// bounds per overlay “fantasma”
const boundsEl = ref(null)
const lineEl = ref(null)
const bgEl = ref(null)
const descEl = ref(null)

// stato drag
let draggedId = null
let currentIntent = { kind: 'none' }

// UI state
let hoverTimer = null
let lastRowEl = null
let lastMode = null
let lastLineWhere = 'bottom'
let raf = 0

function clearTimer() {
  if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null }
}

function hideOverlays() {
  if (lineEl.value) lineEl.value.style.opacity = '0'
  if (bgEl.value) bgEl.value.style.opacity = '0'
  if (descEl.value) descEl.value.style.opacity = '0'
}

function showLineAt(rowRect, containerRect, where) {
  const LINE_PADDING = 12
  const left = containerRect.left + LINE_PADDING
  const width = Math.max(0, containerRect.width - LINE_PADDING * 2)
  const y = where === 'top' ? rowRect.top : rowRect.bottom

  lineEl.value.style.left = `${left}px`
  lineEl.value.style.width = `${width}px`
  lineEl.value.style.top = `${y}px`
  lineEl.value.style.opacity = '1'
}

function showBgAt(rowRect, containerRect) {
  bgEl.value.style.left = `${containerRect.left}px`
  bgEl.value.style.width = `${Math.max(0, containerRect.width)}px`
  bgEl.value.style.top = `${rowRect.top}px`
  bgEl.value.style.height = `${rowRect.height}px`
  bgEl.value.style.opacity = '1'
}

function showDescendantsAt(itemRect, containerRect) {
  descEl.value.style.left = `${containerRect.left}px`
  descEl.value.style.width = `${Math.max(0, containerRect.width)}px`
  descEl.value.style.top = `${itemRect.top}px`
  descEl.value.style.height = `${itemRect.height}px`
  descEl.value.style.opacity = '1'
}

function pickRowFromPoint(x, y) {
  const els = document.elementsFromPoint(x, y)
  for (const el of els) {
    const row = el.closest?.('.row')
    if (!row) continue

    const rect = row.getBoundingClientRect()
    const PAD = 6 // px
        const inside =
        x >= rect.left - PAD &&
        x <= rect.right + PAD &&
        y >= rect.top &&
        y <= rect.bottom

    if (inside) return row
  }
  return null
}

function computeIntentForRow(rowEl, x, y) {
  const rect = rowEl.getBoundingClientRect()
  const yRel01 = rect.height ? (y - rect.top) / rect.height : 0

  const EDGE = 0.20
  if (yRel01 > EDGE && yRel01 < 1 - EDGE) {
    return { mode: 'inside', rect }
  }

  const mid = rect.top + rect.height / 2
  const DEAD = 6
  if (y < mid - DEAD) return { mode: 'line', where: 'top', rect }
  if (y > mid + DEAD) return { mode: 'line', where: 'bottom', rect }
  return { mode: 'line', where: lastLineWhere, rect }
}

function setCurrentIntentFromRow(rowEl, mode, where) {
  const itemEl = rowEl.closest('.draggable-item')
  const targetId = itemEl?.dataset?.id
  if (!targetId) {
    currentIntent = { kind: 'none' }
    return
  }

  if (mode === 'inside') {
    currentIntent = { kind: 'inside', targetId }
  } else {
    currentIntent = { kind: 'line', where, targetId }
  }
}

function onDragOver(e) {
  e.preventDefault()

  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(() => {
    const x = e.clientX
    const y = e.clientY
    const rowEl = pickRowFromPoint(x, y)
    const containerRect = boundsEl.value?.getBoundingClientRect()

    if (!rowEl || !containerRect) {
      clearTimer()
      lastRowEl = null
      lastMode = null
      currentIntent = { kind: 'none' }
      hideOverlays()
      return
    }

    if (lastRowEl && lastRowEl !== rowEl) {
      clearTimer()
      lastMode = null
      hideOverlays()
    }
    lastRowEl = rowEl

    const intent = computeIntentForRow(rowEl, x, y)

    if (intent.mode === 'inside') {
      if (lastMode === 'inside') return
      lastMode = 'inside'

      clearTimer()
      if (lineEl.value) lineEl.value.style.opacity = '0'
      if (bgEl.value) bgEl.value.style.opacity = '0'
      if (descEl.value) descEl.value.style.opacity = '0'

      // salva intent “inside” già adesso (commit su onEnd)
      setCurrentIntentFromRow(rowEl, 'inside')

      hoverTimer = setTimeout(() => {
        if (lastRowEl === rowEl && lastMode === 'inside') {
          showBgAt(intent.rect, containerRect)

          // overlay discendenti SOLO se root (data-depth="0")
          const itemEl = rowEl.closest('.draggable-item')
          const depth = itemEl?.dataset?.depth
          if (depth === '0' && itemEl) {
            showDescendantsAt(itemEl.getBoundingClientRect(), containerRect)
          }
        }
      }, 300)

      return
    }

    // LINE
    const where = intent.where
    if (lastMode === 'line' && where === lastLineWhere) return

    lastMode = 'line'
    lastLineWhere = where

    clearTimer()
    if (bgEl.value) bgEl.value.style.opacity = '0'
    if (descEl.value) descEl.value.style.opacity = '0'

    setCurrentIntentFromRow(rowEl, 'line', where)
    showLineAt(intent.rect, containerRect, where)
  })
}

function startTracking() {
  hideOverlays()
  currentIntent = { kind: 'none' }
  document.addEventListener('dragover', onDragOver, true)
}

function stopTracking() {
  document.removeEventListener('dragover', onDragOver, true)
  cancelAnimationFrame(raf)
  clearTimer()
  lastRowEl = null
  lastMode = null
  hideOverlays()
}

const dndOptions = {
  animation: 0,
  handle: '.drag-handle',
  group: 'notion-group',

  onStart(evt) {
    // dragged DOM -> data-id
    draggedId = evt?.item?.dataset?.id ?? null
    startTracking()
  },

  onEnd() {
    stopTracking()
    // committa l’intent al controller
    emit('intent-commit', { draggedId, intent: currentIntent })
    draggedId = null
    currentIntent = { kind: 'none' }
  },

  // blocca il sort reale: UI-only
  onMove() {
    return false
  },
}
</script>

<template>
  <div ref="boundsEl" class="dnd-bounds">
    <RecursiveDraggable :items="items" :dnd-options="dndOptions">
      <template #row="slotProps">
        <slot name="row" v-bind="slotProps" />
      </template>
    </RecursiveDraggable>
  </div>

  <div ref="bgEl" class="drop-bg-overlay"></div>
  <div ref="descEl" class="drop-desc-overlay"></div>
  <div ref="lineEl" class="drop-line-overlay"></div>
</template>

<style scoped>
.dnd-bounds { width: 100%; }

.drop-bg-overlay {
  position: fixed;
  opacity: 0;
  pointer-events: none;
  background: rgba(35, 131, 226, 0.12);
  border-radius: 6px;
  transition: opacity 80ms linear;
}

.drop-desc-overlay {
  position: fixed;
  opacity: 0;
  pointer-events: none;
  background: rgba(35, 131, 226, 0.06);
  border: 1px solid rgba(35, 131, 226, 0.35);
  border-radius: 10px;
  transition: opacity 80ms linear;
}

.drop-line-overlay {
  position: fixed;
  height: 2px;
  opacity: 0;
  pointer-events: none;
  background: #2383e2;
  transform: translateY(-1px);
  transition: opacity 40ms linear;
}
</style>
