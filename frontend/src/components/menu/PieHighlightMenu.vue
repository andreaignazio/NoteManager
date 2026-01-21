<script setup>
import { computed, ref, watch } from "vue"
import { computeFloatingPosition } from "@/utils/computeFloatingPosition"

const props = defineProps({
  open: { type: Boolean, default: false },
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  centerX: { type: Number, default: 0 },
  centerY: { type: Number, default: 0 },

  context: { type: Object, default: null },

  colors: { type: Array, default: () => [] }, // array di stringhe css (#.. / rgba / var(..))
  current: { type: String, default: null },

  onRegisterApi: Function,
  onUnregisterApi: Function,
})

const cursor = ref({ x: props.x, y: props.y })
const activeIndex = ref(-1)

// geometry (simile al tuo color menu)
const PAD = 6
const R0 = 80
const R_OUT = 150
const DIAM = (R_OUT + PAD) * 2

const center = computed(() => ({ x: props.centerX, y: props.centerY }))

function angleDegClockFromNoon(dx, dy) {
  const a = Math.atan2(dx, -dy) * (180 / Math.PI)
  return (a + 360) % 360
}

function pick(px, py) {
  const dx = px - center.value.x
  const dy = py - center.value.y
  const d = Math.hypot(dx, dy)

  const R_MAX = R_OUT + 400
  if (d < R0) return -1
  if (d > R_MAX) return -1

  const a = angleDegClockFromNoon(dx, dy)
  const n = props.colors.length || 1
  const s = 360 / n
  return n ? (Math.floor(a / s) % n) : -1
}

watch(
  () => props.open,
  (v) => {
    if (v) {
      cursor.value = { x: center.value.x, y: center.value.y }
      activeIndex.value = -1
    } else {
      activeIndex.value = -1
    }
  },
  { immediate: true }
)

function polar(cx, cy, r, degClockFromNoon) {
  const rad = (degClockFromNoon * Math.PI) / 180
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) }
}
function wedgePath(cx, cy, r1, r2, a0, a1) {
  const p0 = polar(cx, cy, r2, a0)
  const p1 = polar(cx, cy, r2, a1)
  const p2 = polar(cx, cy, r1, a1)
  const p3 = polar(cx, cy, r1, a0)
  const large = (a1 - a0 + 360) % 360 > 180 ? 1 : 0
  return [
    `M ${p0.x} ${p0.y}`,
    `A ${r2} ${r2} 0 ${large} 1 ${p1.x} ${p1.y}`,
    `L ${p2.x} ${p2.y}`,
    `A ${r1} ${r1} 0 ${large} 0 ${p3.x} ${p3.y}`,
    "Z",
  ].join(" ")
}

const wedges = computed(() => {
  const n = props.colors.length || 1
  const s = 360 / n
  const cx = center.value.x
  const cy = center.value.y

  return props.colors.map((c, i) => {
    const a0 = i * s
    const a1 = (i + 1) * s
    return {
      i,
      color: c,
      d: wedgePath(cx, cy, R0, R_OUT, a0, a1),
      active: activeIndex.value === i,
      current: props.current != null && props.current === c,
    }
  })
})

function setCursor(px, py) {
  cursor.value = { x: px, y: py }
  activeIndex.value = pick(px, py)
}

function commit() {
  const i = activeIndex.value
  if (i < 0) return { type: "close" }
  const color = props.colors[i]
  return { type: "setHighlight", color, context: props.context }
}

function getCenter() {
  return center.value
}

const api = { setCursor, commit, getCenter }

watch(
  () => props.open,
  (v) => {
    if (v) props.onRegisterApi?.(api)
    else props.onUnregisterApi?.(api)
  },
  { immediate: true }
)

defineExpose({ setCursor, commit, center })
</script>

<template>
  <div v-if="open">
    <div class="overlay" data-pie-overlay="true" />
    <div class="wrap" data-pie-ui="true" :style="{ left: center.x + 'px', top: center.y + 'px' }">
      <svg
        class="svg"
        :width="DIAM"
        :height="DIAM"
        :viewBox="`${center.x - (R_OUT + PAD)} ${center.y - (R_OUT + PAD)} ${DIAM} ${DIAM}`"
      >
        <circle :cx="center.x" :cy="center.y" :r="R_OUT+2" class="backdrop" />
        <path
          v-for="w in wedges"
          :key="w.i"
          :d="w.d"
          class="wedge"
          :class="{ active: w.active, current: w.current }"
          :style="{ '--wedge-fill': w.color }"
        />
        <circle :cx="center.x" :cy="center.y" :r="R0-6" class="centerHole" />
        <path
          v-if="activeIndex>=0"
          :d="wedges[activeIndex].d"
          class="wedge active"
          :style="{ '--wedge-fill': wedges[activeIndex].color }"
        />
        <line :x1="center.x" :y1="center.y" :x2="cursor.x" :y2="cursor.y" class="ray" />
      </svg>
    </div>
  </div>
</template>

<style scoped>
.overlay{
  position:fixed; inset:0; background: rgba(0,0,0,.057);
  z-index:1499; pointer-events:auto !important;
}
.wrap{
  position:fixed; transform:translate(-50%,-50%);
  z-index:1500; pointer-events:none;
}
.svg{ display:block; overflow: visible; }
.backdrop{ fill: var(--bg-main); fill-opacity: .5; }
.centerHole{ fill: rgba(0,0,0,0); }

.wedge{
  --base: var(--wedge-fill, rgba(255,255,255,.94));
  fill: var(--base);
  stroke: rgba(0,0,0,.18);
  stroke-width: .6px;
  filter:saturate(150%) brightness(95%) contrast(115%);
  transition: transform 120ms ease;
  transform-box: fill-box;
  transform-origin: center;
}
.wedge.active{ transform: scale(1.15); }
.wedge.current{ outline: none; }

.ray{ stroke: rgba(0,0,0,.18); stroke-width: 1; }
</style>
