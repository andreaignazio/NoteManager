<!-- PieColorMenu.vue -->
<script setup>
import { computed, ref, watch, onBeforeUnmount } from "vue"
import { computeFloatingPosition } from "@/utils/computeFloatingPosition"

const props = defineProps({
  open: { type: Boolean, default: false },
  kind: { type: String, default: "context" }, // 'dynamic'|'context'
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  centerX: { type: Number, default: 0 },
  centerY: { type: Number, default: 0 },

  context: { type: Object, default: null },

  textTokens: { type: Array, default: () => [] },
  bgTokens: { type: Array, default: () => [] },

  currentText: { type: String, default: "default" },
  currentBg: { type: String, default: "default" },

  labelForText: { type: Function, default: null },
  labelForBg: { type: Function, default: null },
  letterStyleForText: { type: Function, default: null },
  swatchStyleForBg: { type: Function, default: null },
  onRegisterApi: Function,
  onUnregisterApi: Function,
})

const emit = defineEmits(["close", "setText", "setBg"])

const cursor = ref({ x: props.x, y: props.y })
const active = ref({ ring: null, index: -1 }) // ring: 'text'|'bg'|null

// geometry
const PAD = 6
const R0 = 37  
const GAP=0      // hole
const R_BG_OUT = 75  // inner ring outer radius
const R_TXT_OUT = 105 // outer ring outer radius
const DIAM = (R_TXT_OUT + PAD) * 2

const clampedCenter = computed(() => {
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

function angleDegClockFromNoon(dx, dy) {
  const a = Math.atan2(dx, -dy) * (180 / Math.PI)
  return (a + 360) % 360
}

function pick(px, py) {
  const dx = px - center.value.x
  const dy = py - center.value.y
  const d = Math.hypot(dx, dy)

  if (d < R0) return { ring: null, index: -1 }
  const a = angleDegClockFromNoon(dx, dy)

  // bg ring
  if (d >= R0 && d <= R_BG_OUT) {
    const n = props.bgTokens.length || 1
    const s = 360 / n
    return { ring: "bg", index: n ? (Math.floor(a / s) % n) : -1 }
  }

  // text ring
  if (d > R_BG_OUT && d <= R_TXT_OUT + 40) {
    const n = props.textTokens.length || 1
    const s = 360 / n
    return { ring: "text", index: n ? (Math.floor(a / s) % n) : -1 }
  }

  return { ring: null, index: -1 }
}


watch(
  () => props.open,
  (v) => {
    if (v) {
      cursor.value = { x: center.value.x, y: center.value.y }
      active.value = { ring: null, index: -1 }
    } else {
      active.value = { ring: null, index: -1 }
    }
  },
  { immediate: true }
)

// ---- svg helpers
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

function dividerSegment(cx, cy, r1, r2, aDeg, inset = 0) {
  const p1 = polar(cx, cy, r1 + inset, aDeg)
  const p2 = polar(cx, cy, r2 - inset, aDeg)
  return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }
}

const bgWedges = computed(() => {
  const n = props.bgTokens.length || 1
  const s = 360 / n
  const cx = center.value.x
  const cy = center.value.y
  const t = props.bgTokens[5];
 // console.log("bgWedges style:", props.swatchStyleForBg(t))
  return props.bgTokens.map((t, i) => {
    const a0 = i * s
    return {
      token: t,
      i,
      d: wedgePath(cx, cy, R0+GAP, R_BG_OUT, a0, (i + 1) * s),
      divider: dividerSegment(cx, cy, R0, R_BG_OUT, a0, 1.5), // inset 1.5px
      active: active.value.ring === "bg" && active.value.index === i,
      style: props.swatchStyleForBg ? props.swatchStyleForBg(t) : null,
      isCurrent: t === props.currentBg,
      label: props.labelForBg ? props.labelForBg(t) : t,
    }
  })
})

const textWedges = computed(() => {
  const n = props.textTokens.length || 1
  const s = 360 / n
  const cx = center.value.x
  const cy = center.value.y
  const t = props.textTokens[5];
  // console.log("textWedges current:", props.letterStyleForText(props.currentText))
  return props.textTokens.map((t, i) => {
    const a0 = i * s
    return {
      token: t,
      i,
      d: wedgePath(cx, cy, R_BG_OUT + 2, R_TXT_OUT, a0, (i + 1) * s),
      divider: dividerSegment(cx, cy, R_BG_OUT + 2, R_TXT_OUT, a0, 1.5),
      active: active.value.ring === "text" && active.value.index === i,
      style: props.letterStyleForText ? props.letterStyleForText(t) : null,
      isCurrent: t === props.currentText,
      label: props.labelForText ? props.labelForText(t) : t,
    }
  })
})

function setCursor(px, py) {
  cursor.value = { x: px, y: py }
  active.value = pick(px, py)
}

function getActiveSelection() {
  const { ring, index } = active.value
  if (!ring || index < 0) return null

  if (ring === "text") return { type: "setText", token: props.textTokens[index], context: props.context }
  if (ring === "bg") return { type: "setBg", token: props.bgTokens[index], context: props.context }
  return null
}

function commit() {
  return getActiveSelection() ?? { type: "close" }
}

const api = { setCursor, commit }

watch(
  () => props.open,
  (v) => {
    if (v) props.onRegisterApi?.(api)
    else props.onUnregisterApi?.(api)
  },
  { immediate: true }
)


defineExpose({
  setCursor,
  getActiveSelection,
  commit,
  center, // optional
})

function donutPath(cx, cy, r1, r2) {
  // due semi-cerchi (0..180 e 180..360)
  const a0 = 0, a1 = 180, a2 = 360
  const pOuter0 = polar(cx, cy, r2, a0)
  const pOuter1 = polar(cx, cy, r2, a1)
  const pOuter2 = polar(cx, cy, r2, a2)
  const pInner2 = polar(cx, cy, r1, a2)
  const pInner1 = polar(cx, cy, r1, a1)
  const pInner0 = polar(cx, cy, r1, a0)

  return [
    `M ${pOuter0.x} ${pOuter0.y}`,
    `A ${r2} ${r2} 0 0 1 ${pOuter1.x} ${pOuter1.y}`,
    `A ${r2} ${r2} 0 0 1 ${pOuter2.x} ${pOuter2.y}`,
    `L ${pInner2.x} ${pInner2.y}`,
    `A ${r1} ${r1} 0 0 0 ${pInner1.x} ${pInner1.y}`,
    `A ${r1} ${r1} 0 0 0 ${pInner0.x} ${pInner0.y}`,
    "Z",
  ].join(" ")
}

const bgRingOutlinePath = computed(() => {
  const cx = center.value.x
  const cy = center.value.y
  return donutPath(cx, cy, R0, R_BG_OUT)
})

const textRingOutlinePath = computed(() => {
  const cx = center.value.x
  const cy = center.value.y
  return donutPath(cx, cy, R_BG_OUT + 2, R_TXT_OUT)
})

</script>

<template>
  <div v-if="open">
    <div class="overlay" data-pie-overlay="true" />

    <div class="wrap" :style="{ left: center.x + 'px', top: center.y + 'px' }">
      <svg
        class="svg"
        :width="DIAM"
        :height="DIAM"
        :viewBox="`${center.x - (R_TXT_OUT + PAD)} ${center.y - (R_TXT_OUT + PAD)} ${DIAM} ${DIAM}`"
      >
        <defs>
          <!-- shadow soft -->
          <filter id="ringShadowSoft" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="12" stdDeviation="10" flood-color="rgba(0,0,0,.18)" />
          </filter>

          <!-- shadow tighter -->
          <filter id="ringShadowTight" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="8" stdDeviation="7" flood-color="rgba(0,0,0,.16)" />
          </filter>

          <!-- CLIP: keep only the OUTSIDE part of the shadow (hide inner shadow) -->
          <clipPath id="clipShadowOuterOnly" clipPathUnits="userSpaceOnUse">
            <path
              :d="`
                M ${center.x - 5000} ${center.y - 5000}
                h 10000 v 10000 h -10000 Z
                M ${center.x} ${center.y}
                m ${-(R0 + 1)} 0
                a ${R0 + 1} ${R0 + 1} 0 1 0 ${(R0 + 1) * 2} 0
                a ${R0 + 1} ${R0 + 1} 0 1 0 ${-(R0 + 1) * 2} 0
              `"
              fill-rule="evenodd"
              clip-rule="evenodd"
            />
          </clipPath>
        </defs>

        <!-- SHADOWS (under rings) - clipped to outside only -->
        <path
          :d="bgRingOutlinePath"
          class="ringShadowStroke bg"
          filter="url(#ringShadowTight)"
          clip-path="url(#clipShadowOuterOnly)"
        />
        <path
          :d="textRingOutlinePath"
          class="ringShadowStroke text"
          filter="url(#ringShadowSoft)"
          clip-path="url(#clipShadowOuterOnly)"
        />

        <!-- BG ring -->
         <circle :cx="center.x" :cy="center.y" :r="R_TXT_OUT + 30" class="myShadow" 
         :style="{zIndex:1400}"/>
         <circle :cx="center.x" :cy="center.y" :r="R_TXT_OUT+3" class="backdrop" />
         <circle :cx="center.x" :cy="center.y" :r="R_TXT_OUT+1.5" class="stroke" />
        <path
          v-for="w in textWedges"
          :key="'tx:' + w.token"
          :d="w.d"
          class="wedge2"
          :class="{ active: w.active, current: w.isCurrent }"
          :style="w.style?.color ? { '--wedge-fill': w.style.color } : null"
        />
        <line
          v-for="w in textWedges"
          :key="'tx-div:' + w.token"
          class="divider divider-text"
          :x1="w.divider.x1" :y1="w.divider.y1"
          :x2="w.divider.x2" :y2="w.divider.y2"
        />

         <circle :cx="center.x" :cy="center.y" :r="R_BG_OUT + 15" class="myShadow heavy" />
        
        <circle :cx="center.x" :cy="center.y" :r="R_BG_OUT -1" class="radialDivider" />
        <path
          v-for="w in bgWedges"
          :key="'bg:' + w.token"
          :d="w.d"
          class="wedge first-ring"
          :class="{ active: w.active, current: w.isCurrent }"
          :style="w.style?.backgroundColor ? { '--wedge-fill': w.style.backgroundColor } : null" 
        />
         <path
          v-if="active.ring==='text' && active.index>=0"
          :d="textWedges[active.index].d"
          class="wedge first-ring active isTop"
          :style="textWedges[active.index].style?.color ? { '--wedge-fill': textWedges[active.index].style.color } : null"
        />
        <line
          v-for="w in bgWedges"
          :key="'bg-div:' + w.token"
          class="divider divider-bg"
          :x1="w.divider.x1" :y1="w.divider.y1"
          :x2="w.divider.x2" :y2="w.divider.y2"
        />
        
        <path
          v-if="active.ring==='bg' && active.index>=0"
          :d="bgWedges[active.index].d"
          class="wedge first-ring active isTop"
          :style="bgWedges[active.index].style?.backgroundColor ? { '--wedge-fill': bgWedges[active.index].style.backgroundColor } : null"
        />
       
        
        <circle :cx="center.x" :cy="center.y" :r="R0+10" class="myShadow heavy" />
        <circle :cx="center.x" :cy="center.y" :r="R0+2" class="center" />
         <circle :cx="center.x" :cy="center.y" :r="R0+5" class="myShadow heavy" />
           <circle :cx="center.x" :cy="center.y" :r="R0-8" class="center light" />
           
      
        
         

        <!-- TEXT ring -->
        

        <!-- Center + ray -->
        
        <line :x1="center.x" :y1="center.y" :x2="cursor.x" :y2="cursor.y" class="ray" />
      </svg>

      <div class="hint">BG (inner) • Text (outer)</div>

      <div class="preview">
        <span
          class="A"
          :style="(letterStyleForText && active.ring === 'text' && active.index >= 0)
            ? letterStyleForText(textTokens[active.index])
            : (letterStyleForText && currentText)
              ? props.letterStyleForText(props.currentText)
              : null"
        >A</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
  .backdrop{
    fill:var(--bg-main);
    fill-opacity: 1;
  }
  .stroke{
    fill:none;
    stroke-width: 1px;
    stroke: rgba(255, 255, 255, 0.881);
  }
 html[data-theme="dark"] .stroke{
    fill:none;
    stroke-width: 1px;
    stroke: rgba(203, 203, 203, 0.737);
  }
  .divider {
    stroke: rgba(232, 232, 232, 0.838);
    stroke-width: 0;
    pointer-events: none;
    vector-effect: non-scaling-stroke;
    opacity: 0.9;
  }

  /* se vuoi differenziare inner/outer */
  .divider-bg { opacity: 0; }
  .divider-text { opacity: 0.65; }

  .radialDivider{
    fill: none;
    stroke: rgb(220, 220, 220);
    stroke-width: 5px;
    stroke-opacity: 100%;
    pointer-events: none;
   }

  html[data-theme="dark"] .radialDivider{
    fill: rgba(0, 0, 0, 0);
    stroke: rgb(188, 188, 188);
   }


  .myShadow{
    fill: rgba(0, 0, 0, 0.08);
    filter:blur(10px);
    z-index: 0;} 
    .myShadow.heavy{
      fill: rgba(0, 0, 0, 0.196);
      filter: blur(10px);
    }

    html[data-theme="dark"] .myShadow .myShadow.heavy{
    fill: rgba(0, 0, 0, 0.256);
    } 

   .center{
    fill:rgb(255, 255, 255);
    stroke: rgba(203, 203, 203, 0);
   }

   html[data-theme="dark"] .center{
    fill: #202020;
    stroke: rgba(158, 158, 158, 0);
   }

   html[data-theme="dark"] .center.light{
    fill:#5f5f5f39;
    stroke: rgba(158, 158, 158, 0);
   }

   .wedge {
      --base: var(--wedge-fill, var(--bg-menu, rgba(255,255,255,.94)));
      --lifted: color-mix(in srgb, var(--base) calc(100% - var(--pie-k)), var(--pie-mix) var(--pie-k));
      --state: 0%;
      --state-mix: white;
      
      fill: color-mix(in srgb, var(--lifted) calc(100% - var(--state)), var(--state-mix) var(--state));
      stroke: color-mix(in srgb, var(--lifted) 70%, rgba(0,0,0,.25) 30%);
      filter:saturate(190%) brightness(90%) contrast(120%);
      stroke-width: .5px;
    }
    html[data-theme="dark"] .wedge{
      filter:saturate(80%) brightness(200%)contrast(120%);
    }

    
    .wedge.current { --state: 22%; --state-mix: var(--accent, white); }

    .wedge2{
       --base: var(--wedge-fill, var(--bg-menu, rgba(255,255,255,.94)));
      --lifted: color-mix(in srgb, var(--base) calc(100% - var(--pie-k)), var(--pie-mix) var(--pie-k));
      --state: 60%;
      --state-mix: var(--state-mix-text, rgba(0,0,0,1));

      fill: color-mix(in srgb, var(--lifted) calc(100% - var(--state)), var(--state-mix) var(--state));
      stroke: color-mix(in srgb, var(--lifted) 70%, rgba(0,0,0,.25) 30%);
      stroke-width: 1.5px;
      stroke-opacity: .2;
      filter:saturate(80%) brightness(100%)  
    }
    

    html[data-theme="dark"] .wedge2{
      --state: 50%;
      stroke-opacity: .0;
      filter:saturate(90%) brightness(75%) contrast(120%)
    }

    .wedge2.active { --state: 50%; }

    html[data-theme="dark"] .wedge2.active{
       --state: 50%;
      stroke-opacity: .8;
      filter:saturate(90%) brightness(0%);
    }

    .wedge2.current { 
      --state: 20%;
      --state-mix: var(--accent, white);
      filter: brightness(85%) saturate(92%);
      
      }
      
      .wedge, .wedge2 {
        transform-box: fill-box;
        transform-origin: center;
        transition: transform 120ms ease, filter 120ms ease;
        will-change: transform;
      }

      .wedge.active { transform: scale(1.2); }
      .wedge2.active { transform: scale(1.2); }
      




 .ringShadowStroke{
  fill: none;
  stroke: transparent;   /* invisibile */
  stroke-width: 14px;    /* controlla “quanto” è grande la shadow */
  pointer-events: none;
}

.ringShadowStroke.bg{
  stroke-width: 12px; 
     /* puoi differenziare inner/outer */
}
.ringShadowStroke.text{
  stroke-width: 10px;
 
}

.overlay{
   position:fixed; 
   inset:0; 
   background: rgba(0,0,0,.057);
    z-index:1499; 
  pointer-events:auto !important;
}
.wrap{ position:fixed; transform:translate(-50%,-50%); z-index:1500; pointer-events:none; }
.svg{ 
  display:block; 
  overflow: visible;
}


.preview{
  position:absolute; left:50%; top:50%;
  transform: translate(-50%,-50%);
  pointer-events:none;
}
.A{
  color: var(--text-main);
  width: 26px; height: 26px;
  border-radius: 7px;
  display:grid; place-items:center;
  font-weight: 800;
  background: rgba(220, 26, 26, 0);
  border:0px solid rgba(0,0,0,.10);
  opacity: .9;
}


</style>
