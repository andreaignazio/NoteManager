<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  active: {type: Boolean, default: true},
  width: { type: Number, default: 280 },
  minWidth: { type: Number, default: 220 },
  maxWidth: { type: Number, default: 420 },

  topOffset: { type: Number, default: 52 },
  heightRatio: { type: Number, default: 0.8 },

  closeDelay: { type: Number, default: 180 },
  zIndex: { type: Number, default: 50 },

  //  allarga la regione “tollerante” che mantiene l’hover
  hoverPad: { type: Number, default: 18 },      // px attorno al pannello
  bridgeWidth: { type: Number, default: 26 },   // px corridoio a sinistra

})

const panelEl = ref(null)
const hoverPadEl = ref(null)
const bridgeEl = ref(null)

defineExpose({
  panelEl,
  hoverPadEl,
  bridgeEl
})

const emit = defineEmits(['close', 'resize'])

const hovering = ref(false)
const isResizing = ref(false)

let closeTimer = null
function clearCloseTimer() {
  if (closeTimer) clearTimeout(closeTimer)
  closeTimer = null
}

function scheduleClose() {
  clearCloseTimer()
  closeTimer = setTimeout(() => {
    console.log("Active:",props.active)
    if(!props.active) return //chiusura sospesa se flyout non è layer top
    //  non chiudere se sto resizand
    if (!hovering.value && !isResizing.value) emit('close')
  }, props.closeDelay)
}

function onEnter() {
  hovering.value = true
  clearCloseTimer()
}

function onLeave() {
  hovering.value = false
  // non chiudere se sto resizand
  if (isResizing.value) return
  scheduleClose()
}

const flyoutScrollEl = ref(null)
let flyoutScrollTimer = null

function setFlyoutScrolling() {
  const el = flyoutScrollEl.value
  if (!el) return
  el.classList.add('is-scrolling')
  if (flyoutScrollTimer) clearTimeout(flyoutScrollTimer)
  flyoutScrollTimer = setTimeout(() => {
    el.classList.remove('is-scrolling')
  }, 450)
}


// -------- Flyout resize  ----------
let resizePointerId = null
let resizeStartX = 0
let resizeStartWidth = 0

const clamp = (v, min, max) => Math.max(min, Math.min(max, v))

function addResizeListeners() {
  window.addEventListener('pointermove', onResizePointerMove, { passive: true })
  window.addEventListener('pointerup', endResize, { passive: true })
  window.addEventListener('pointercancel', endResize, { passive: true })
  window.addEventListener('blur', endResize) // safety extra
}

function removeResizeListeners() {
  window.removeEventListener('pointermove', onResizePointerMove)
  window.removeEventListener('pointerup', endResize)
  window.removeEventListener('pointercancel', endResize)
  window.removeEventListener('blur', endResize)
}

function onResizePointerDown(e) {
  isResizing.value = true
  hovering.value = true
  clearCloseTimer()

  resizePointerId = e.pointerId
  resizeStartX = e.clientX
  resizeStartWidth = props.width

  e.currentTarget?.setPointerCapture?.(e.pointerId)

  document.documentElement.style.cursor = 'col-resize'
  document.documentElement.style.userSelect = 'none'

  addResizeListeners()
}

function onResizePointerMove(e) {
  if (!isResizing.value) return
  if (resizePointerId != null && e.pointerId !== resizePointerId) return

  const dx = e.clientX - resizeStartX
  const next = clamp(resizeStartWidth + dx, props.minWidth, props.maxWidth)
  emit('resize', next)
}

function endResize(e) {
  if (!isResizing.value) return
  if (e?.pointerId != null && resizePointerId != null && e.pointerId !== resizePointerId) return

  isResizing.value = false
  resizePointerId = null

  document.documentElement.style.cursor = ''
  document.documentElement.style.userSelect = ''

  removeResizeListeners()

  
  if (!hovering.value) scheduleClose()
}

onBeforeUnmount(() => {
  clearCloseTimer()
  removeResizeListeners()
  document.documentElement.style.cursor = ''
  document.documentElement.style.userSelect = ''
})

// Se il flyout viene chiuso mentre si sta resizand, reset immediato
watch(
  () => props.open,
  (open) => {
    if (!open) {
      isResizing.value = false
      resizePointerId = null
      clearCloseTimer()
      removeResizeListeners()
      document.documentElement.style.cursor = ''
      document.documentElement.style.userSelect = ''
    }
  }
)

const panelStyle = computed(() => {
  const ratio = clamp(props.heightRatio, 0.4, 1)
  const height = `calc((100vh - ${props.topOffset}px) * ${ratio})`
  return {
    position: 'fixed',
    top: `${props.topOffset}px`,
    left: '0px',
    height,
    width: `${props.width}px`,
    pointerEvents: 'auto',
    zIndex: props.zIndex,
  }
})


const hoverPadStyle = computed(() => {
  const ratio = clamp(props.heightRatio, 0.4, 1)
  const height = `calc((100vh - ${props.topOffset}px) * ${ratio})`
  const pad = props.hoverPad
  return {
    position: 'fixed',
    top: `calc(${props.topOffset}px - ${pad}px)`,
    left: `-${pad}px`,
    height: `calc(${height} + ${pad * 2}px)`,
    width: `calc(${props.width}px + ${pad * 2}px)`,
    pointerEvents: 'auto',
    zIndex: props.zIndex,
    background: 'transparent',
  }
})

const bridgeStyle = computed(() => ({
  top: `${props.topOffset}px`,
  width: `${props.bridgeWidth}px`,
}))
</script>

<template>
  <div v-if="open" class="flyout-root" :style="{ zIndex }">
    <!-- ✅ Hover pad (tiene aperto il flyout anche se “scivoli” fuori di pochi px) -->
    <div
      ref = "hoverPadEl"
      class="flyout-hoverpad"
      :style="hoverPadStyle"
      @pointerenter="onEnter"
      @pointerleave="onLeave"
    />

    <!-- Bridge area -->
    <div
      ref = "bridheEl"
      class="flyout-bridge"
      :style="bridgeStyle"
      @pointerenter="onEnter"
      @pointerleave="onLeave"
    />

    <!-- Panel -->
    <aside
      ref="panelEl"
      class="flyout-panel"
      :style="panelStyle"
      @pointerenter="onEnter"
      @pointerleave="onLeave"
    >
       <div ref="flyoutScrollEl" class="flyout-scroll scrollbar-auto"
       @scroll.passive="setFlyoutScrolling"
       >
        <slot />
      </div>


      <!-- Resize handle -->
      <div
        class="flyout-resize-handle"
        role="separator"
        aria-orientation="vertical"
        :aria-valuenow="width"
        :aria-valuemin="minWidth"
        :aria-valuemax="maxWidth"
        @pointerdown="onResizePointerDown"
      />
    </aside>
  </div>
</template>

<style scoped>
.flyout-root {
  position: fixed;
  inset: 0;
  pointer-events: none;
}

.flyout-hoverpad {
  pointer-events: auto;
}

.flyout-bridge {
  position: fixed;
  left: 0;
  bottom: 0;
  pointer-events: auto;
}

.flyout-panel {
  position: relative;
  background: #fff;
  border-right: 1px solid rgba(0,0,0,.08);
  box-shadow: 0 10px 30px rgba(0,0,0,.12);
  /*overflow: auto;*/

  /* rounded SOLO a destra */
  border-top-right-radius: 14px;
  border-bottom-right-radius: 14px;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;

  overflow: hidden;
}
.flyout-scroll {
  height: 100%;
  overflow: auto;   /* ✅ qui lo scroll */
}

.flyout-resize-handle {
  position: absolute;
  top: 0;
  right: -8px;       /* un po’ più largo = più facile prendere */
  width: 16px;
  height: 100%;
  cursor: col-resize;
  touch-action: none;
  pointer-events: auto;
  z-index: 5;
}

.flyout-resize-handle::after {
  content: '';
  position: absolute;
  top: 10px;
  bottom: 10px;
  left: 50%;
  width: 1px;
  transform: translateX(-0.5px);
  background: rgba(0,0,0,.10);
  opacity: 0;
}

.flyout-resize-handle:hover::after {
  opacity: 1;
}
</style>