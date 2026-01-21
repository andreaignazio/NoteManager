<!-- src/components/menu/PieBlockTypeMenu.vue -->
<script setup>
import { computed, ref, watch } from "vue"
import { computeFloatingPosition } from "@/utils/computeFloatingPosition"
import { BLOCK_TYPES } from "@/domain/blockTypes" // 👈 catalogo ufficiale
import { getIconComponent } from '@/icons/catalog'

const ringIconMode = ref('lucide')
// 'text'  -> usa bt.icon
// 'lucide'-> usa bt.iconId

const props = defineProps({
  open: { type: Boolean, default: false },
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  centerX: { type: Number, default: 0 },
  centerY: { type: Number, default: 0 },
  context: { type: Object, default: null },

  currentType: { type: String, default: "p" },

  onRegisterApi: Function,
  onUnregisterApi: Function,
})

const cursor = ref({ x: props.x, y: props.y })
const activeIndex = ref(-1)

// geometry
const PAD = 6
const R0 = 100        // hole radius
const R_OUT = 150    // ring outer
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
  if (d < R0) return -1
  if (d > R_OUT + 46) return -1

  const n = BLOCK_TYPES.length || 1
  const a = angleDegClockFromNoon(dx, dy)
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

// svg helpers
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

const sectorSize = computed(() => 360 / (BLOCK_TYPES.length || 1))
const wedges = computed(() => {
  const cx = center.value.x
  const cy = center.value.y
  const s = sectorSize.value
  const rLabel = (R0 + R_OUT) / 2

  return BLOCK_TYPES.map((bt, i) => {
    const a0 = i * s
    const a1 = (i + 1) * s
    const amid = a0 + s / 2
    const labelPos = polar(cx, cy, rLabel, amid)

    return {
      ...bt,
      i,
      d: wedgePath(cx, cy, R0, R_OUT, a0, a1),
      labelPos,
      isCurrent: String(bt.type) === String(props.currentType),
    }
  })
})

function toLocal(labelPos) {
  const localX = labelPos.x - (center.value.x - DIAM / 2)
  const localY = labelPos.y - (center.value.y - DIAM / 2)
  return { x: localX, y: localY }
}

function setCursor(px, py) {
  cursor.value = { x: px, y: py }
  activeIndex.value = pick(px, py)
}

function commit() {
  const idx = activeIndex.value
  if (idx < 0) return { type: "close" }
  const bt = BLOCK_TYPES[idx]
  return { type: "setBlockType", blockType: bt.type, context: props.context }
}

const api = { setCursor, commit }
watch(
  () => props.open,
  (v) => (v ? props.onRegisterApi?.(api) : props.onUnregisterApi?.(api)),
  { immediate: true }
)

const activeItem = computed(() => {
  const i = activeIndex.value
  return i >= 0 ? wedges.value[i] : null
})

defineExpose({ setCursor, commit, center })
</script>

<template>
  <div v-if="open">
    <div class="overlay" data-pie-overlay="true" />

    <div class="wrap" data-pie-ui="true" :style="{ left: center.x+'px', top: center.y+'px' }">
      <svg
        class="svg"
        :width="DIAM"
        :height="DIAM"
        :viewBox="`${center.x - (R_OUT + PAD)} ${center.y - (R_OUT + PAD)} ${DIAM} ${DIAM}`"
      >
        <path
          v-for="w in wedges"
          :key="w.type"
          :d="w.d"
          class="wedge"
          :class="{ active: w.i === activeIndex, current: w.isCurrent }"
        />
        <circle :cx="center.x" :cy="center.y" :r="R0-2" class="center" />
                <!-- CENTER PREVIEW -->
        <div class="centerPreview" v-if="activeItem">
          <div class="previewIcon">
            <span v-if="ringIconMode === 'text'">
              {{ activeItem.icon }}
            </span>
            <component
              v-else
              :is="getIconComponent(activeItem.iconId)"
              :size="20"
            />
          </div>

          <div class="previewLabel">
            {{ activeItem.label }}
          </div>

          <div class="previewDesc">
            {{ activeItem.description }}
          </div>
        </div>
        <line :x1="center.x" :y1="center.y" :x2="cursor.x" :y2="cursor.y" class="ray" />
      </svg>
      <div
        v-for="w in wedges"
        :key="w.type + '-ui'"
        class="item"
        :class="{ active: w.i === activeIndex }"
        :style="{
          left: toLocal(w.labelPos).x + 'px',
          top: toLocal(w.labelPos).y + 'px',
        }"
      >
        <!-- TEXT ICON -->
        <div v-if="ringIconMode === 'text'" class="iconTxt">
          {{ w.icon }}
        </div>

        <!-- LUCIDE ICON -->
        <component
          v-else
          :is="getIconComponent(w.iconId)"
          class="iconLucide"
          :size="18"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay{ position:fixed; inset:0; background: rgba(0,0,0,.057); z-index:1499; pointer-events:auto !important; }
.wrap{ position:fixed; transform: translate(-50%,-50%); z-index:1500; pointer-events:none; }
.svg{ display:block; }

.wedge{
  fill: var(--bg-menu, rgba(255,255,255,.94));
  stroke: rgba(0,0,0,.14);
  stroke-width: 1;
  filter: drop-shadow(0 12px 30px rgba(0,0,0,.14));
  transition: transform 120ms ease;
  transform-box: fill-box;
  transform-origin: center;
}
.wedge.active{ transform: scale(1.12); }
.wedge.current{ stroke: var(--accent); stroke-width: 2; }

.center{ fill: transparent; stroke: rgba(0,0,0,.12); }
.ray{ stroke: rgba(0,0,0,.18); stroke-width: 1; }

.item{
  position:absolute;
  transform: translate(-50%,-50%);
  pointer-events:none;
}
.iconTxt{
  font-weight: 800;
  font-size: 14px;
  opacity: .92;
}

.iconLucide{
  opacity: .9;
}
.centerPreview{
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  text-align: center;
  max-width: 160px;
}

.previewIcon{
  font-size: 20px;
  margin-bottom: 4px;
  opacity: .9;
}

.previewLabel{
  font-weight: 700;
  font-size: 13px;
  line-height: 1.1;
}

.previewDesc{
  font-size: 11px;
  opacity: .65;
  line-height: 1.2;
}
.centerPreview{
  transition: opacity 80ms ease, transform 80ms ease;
}
</style>
