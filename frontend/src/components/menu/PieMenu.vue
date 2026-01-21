<!-- PieMenu.vue -->
<script setup>
import { computed, watch, ref, } from "vue"
import { getIconComponent } from "@/icons/catalog"
import { computeFloatingPosition } from "@/utils/computeFloatingPosition"


const props = defineProps({
  open: { type: Boolean, default: false },
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  centerX: { type: Number, default: 0 },
  centerY: { type: Number, default: 0 },
  context: { type: Object, default: null },
  mode: { type: String, default: 'block' }, // 'block'|'ai'
  area: { type: String, default: 'main' },  // 'main'|'sidebar'
  onRegisterApi: Function,
  onUnregisterApi: Function,
  highlightSwatch: { type: String, default: null }


})

const emit = defineEmits(["close", "action", "intent"])

const cursor = ref({ x: props.x, y: props.y })
const activeIndex = ref(-1)

const dwellTimer = ref(null)
const dwellArmed = ref(false)
const moveToSticky = ref(false)

function clearDwell() {
  if (dwellTimer.value) {
    clearTimeout(dwellTimer.value)
    dwellTimer.value = null
  }
}

const PRESETS = {
  main: {
    block: [
      { id:'duplicate', label:'Duplica', iconId:'lucide:files' },
      { id:'color', label:'Color', iconId:'lucide:palette' },
      { id:'highlight', label:'Highlight', iconId:'lucide:highlighter' },
      { id:'moveTo', label:'Move to', iconId:'lucide:folder-input' },
      { id:'changeType', label:'Change type', iconId:'lucide:blocks' },
    ],
    ai: [
      { id:'ai', label:'AI tools', iconId:'lucide:sparkles' },
      { id:'share', label:'Share', iconId:'lucide:share-2' },
      { id:'copy', label:'Copy', iconId:'lucide:copy' },
      { id:'paste', label:'Paste', iconId:'lucide:clipboard-paste' },
    ],
    text: [
      { id:'bold', label:'Bold', iconId:'lucide:bold' },
      { id:'italic', label:'Italic', iconId:'lucide:italic' },
      { id:'strike', label:'Strike', iconId:'lucide:strikethrough' },
      { id:'underline', label:'Underline', iconId:'lucide:underline' },
      { id:'link', label:'Link', iconId:'lucide:link' },
    ],
    
  },
  sidebar: {
    block: [
      { id:'newPage', label:'New page', iconId:'lucide:file' },
      { id:'rename', label:'Rename', iconId:'lucide:edit-3' },
      { id:'movePage', label:'Move', iconId:'lucide:folder-input' },
      { id:'share', label:'Share', iconId:'lucide:share-2' },
      { id:'trash', label:'Delete', iconId:'lucide:trash-2' },
    ],
    ai: [
      { id:'ai', label:'AI tools', iconId:'lucide:sparkles' },
      { id:'summarize', label:'Summarize', iconId:'lucide:lightbulb' },
      { id:'translate', label:'Translate', iconId:'lucide:globe' },
      { id:'copy', label:'Copy', iconId:'lucide:copy' },
    ],
  },
}

const resolvedItems = computed(() => {
  const v = PRESETS?.[props.area]?.[props.mode]
  return Array.isArray(v) ? v : []   // 👈 sempre array
})

const sectorSize = computed(() => {
  const n = resolvedItems.value.length || 1
  return 360 / n
})



const R_IN = 56
const R_OUT = 100
const PAD = 6
const DIAM = (R_OUT + PAD) * 2

//const sectorSize = computed(() => 360 / items.length)

// 0° = UP, cresce CLOCKWISE
function angleDegClockFromNoon(dx, dy) {
  const a = Math.atan2(dx, -dy) * (180 / Math.PI)
  return (a + 360) % 360
}

const clampedCenter = computed(() => {
  // pie: translate(-50%,-50%) => tx=0.5 ty=0.5
  return computeFloatingPosition({
    x: props.x,
    y: props.y,
    w: DIAM,
    h: DIAM,
    tx: 0.5,
    ty: 0.5,
    margin: 10,
  })
})

//const center = computed(() => ({ x: clampedCenter.value.x, y: clampedCenter.value.y }))
const center = computed(() => ({ x: props.centerX, y: props.centerY }))

function pickIndex(px, py) {
  const dx = px - center.value.x
  const dy = py - center.value.y
  const d = Math.hypot(dx, dy)

  const R_MAX = R_OUT + 400
  if (d < R_IN) return -1
  if (d > R_MAX) return -1

  const a = angleDegClockFromNoon(dx, dy)
  const n = resolvedItems.value.length
  return n ? (Math.floor(a / sectorSize.value) % n) : -1
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


// --- geometry (clockwise from noon) ---
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
  const cx = center.value.x
  const cy = center.value.y
  const s = sectorSize.value
  const rLabel = (R_IN + R_OUT) / 2

  return resolvedItems.value.map((it, i) => {
    const a0 = i * s
    const a1 = (i + 1) * s
    const amid = a0 + s / 2
    const labelPos = polar(cx, cy, rLabel, amid)

    return {
      ...it,
      i,
      d: wedgePath(cx, cy, R_IN, R_OUT, a0, a1),

      divider: {
      p1: polar(cx, cy, R_IN, a0),
      p2: polar(cx, cy, R_OUT, a0),
    },

      labelPos,
      Icon: it.iconId ? getIconComponent(it.iconId) : null,
    }
  })
})

// Per posizionare gli item HTML sopra lo svg: convertiamo coords assolute in coords locali nel box DIAM
function toLocal(labelPos) {
  const localX = labelPos.x - (center.value.x - DIAM / 2)
  const localY = labelPos.y - (center.value.y - DIAM / 2)
  return { x: localX, y: localY }
}

function setCursor(px, py) {
  const idx = pickIndex(px, py)
 // console.log("[PIE] setCursor", px, py, "center", center.value, "idx", idx)
  cursor.value = { x: px, y: py }
  activeIndex.value = pickIndex(px, py)
}

function getActiveItem() {
  const idx = activeIndex.value
 // console.log("getActiveItem", { idx, item: resolvedItems.value[idx] })
  return idx >= 0 ? (resolvedItems.value[idx] ?? null) : null
}

// formato standard per controller
function commit() {
  const it = getActiveItem()
  if (!it) return { type: "close" }
  return { type: "action", id: it.id, context: props.context }
}

function reset() {
  cursor.value = { x: center.value.x, y: center.value.y }
  activeIndex.value = -1
  clearDwell?.() // se ce l’hai, altrimenti ignora
}

const api = { setCursor, getActiveItem, commit, reset }

watch(
  () => props.open,
  (v) => {
    if (v) {
      props.onRegisterApi?.(api)
    } else {
      props.onUnregisterApi?.(api)
    }
  },
  { immediate: true }
)



defineExpose({
  setCursor,
  getActiveItem,
  commit,
  center, // optional
  reset,
})

/*watch(activeIndex, (v) => console.log("[PIE] activeIndex", v))
watch(cursor, (v) => console.log("[PIE] cursor", v))
watch(center, (v) => console.log("[PIE] center", v))*/


</script>

<template>
  <div v-if="open">
    <!-- overlay (stesso stile light) -->
    <div class="overlay" data-pie-overlay="true" @pointerdown.prevent @contextmenu.prevent />

    <!-- wrapper fixed centrato -->
    <div class="pieWrap" data-pie-ui="true"
    :style="{ left: center.x + 'px', top: center.y + 'px' }">
      <svg
        class="pieSvg"
        :width="DIAM"
        :height="DIAM"
        :viewBox="`${center.x - (R_OUT + PAD)} ${center.y - (R_OUT + PAD)} ${DIAM} ${DIAM}`"
      >
        <path
          v-for="w in wedges"
          :key="w.id"
          :d="w.d"
          class="wedge"
          :class="{ active: w.i === activeIndex }"
        />
        <circle :cx="center.x" :cy="center.y" :r="R_IN - 2" class="center" />
        <line :x1="center.x" :y1="center.y" :x2="cursor.x" :y2="cursor.y" class="ray" />
        <line
          v-for="w in wedges"
          :key="w.id + '-divider'"
          :x1="w.divider.p1.x"
          :y1="w.divider.p1.y"
          :x2="w.divider.p2.x"
          :y2="w.divider.p2.y"
          class="divider"
        />
      </svg>

      <!-- labels + icons in HTML (Notion-like) -->
      <div
        v-for="w in wedges"
        :key="w.id + '-ui'"
        class="item"
        :class="{ active: w.i === activeIndex }"
        :style="{
          left: toLocal(w.labelPos).x + 'px',
          top: toLocal(w.labelPos).y + 'px',
        }"
      >
        <component v-if="w.Icon" :is="w.Icon" class="icon" :size="18" />
        <!--<div class="lbl">{{ w.label }}</div>-->
        <span
          v-if="w.id === 'highlight'"
          class="swatch"
          :style="{ '--swatch': props.highlightSwatch || '#FFEE58' }"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* overlay come ref */
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.057);
  z-index: 1499;
  pointer-events: auto !important;
}

.divider {
  stroke: var(--border-pie);
  stroke-width: 2;
  pointer-events: none;
}

/* wrapper: pointer-events none, tutto interattivo via gesture globali */
.pieWrap {
  position: fixed;
  transform: translate(-50%, -50%);
  z-index: 1500;
  pointer-events: none;
}

.pieSvg {
  display: block;
}
.center{
  fill-opacity: 0;
  stroke-opacity: .5;
}
.swatch{
  --c: var(--swatch);
  position: absolute;
  width: 10px;
  height: 10px;
  border-radius: 999px;
  right: -2px;
  bottom: -2px;

  background: var(--c);
  box-shadow:
    0 0 0 1px rgba(255,255,255,.85),
    0 2px 10px rgba(0,0,0,.18);
  border: 1px solid rgba(0,0,0,.18);

  opacity: .98;
  pointer-events: none;
}

/*
.wedge {
  fill: var(--bg-menu, rgba(255,255,255,.94));
  stroke: var(--border-menu, rgba(0,0,0,.12));
  stroke-width: 1;
  filter: drop-shadow(0 12px 30px rgba(0,0,0,.14));
}
.wedge.active {
  fill: var(--bg-hover, rgba(0,0,0,.06));
  stroke: rgba(0,0,0,.20);
}


.center {
  fill: var(--bg-menu, rgba(255,255,255,.94));
  stroke: var(--border-menu, rgba(0,0,0,.12));
  stroke-width: 1;
  filter: drop-shadow(0 10px 24px rgba(0,0,0,.12));
}

.ray {
  stroke: rgba(0, 0, 0, 0.18);
  stroke-width: 1;
}


.item {
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  color: rgba(0,0,0,.72);
  font-size: 12px;
  line-height: 1.1;
  letter-spacing: -0.01em;
  user-select: none;
}
.item {
  color: var(--text-main, rgba(0,0,0,.72));
  font-size: 12px;
}
.item.active {
  color: var(--text-main, rgba(0,0,0,.92));
  font-weight: 600;
}

.icon {
  opacity: 0.92;
}

.item.active {
  color: rgba(0,0,0,.92);
  font-weight: 600;
}*/
</style>
