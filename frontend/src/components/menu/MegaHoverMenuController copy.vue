<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { useOverlayBindingKeyed } from "@/composables/useOverlayBindingKeyed";

import { useAnchorRegistryStore } from "@/stores/anchorRegistry";

type Placement =
  | "right-start"
  | "left-start"
  | "bottom-end"
  | "bottom-start"
  | "top-start"
  | "top-end";

type PanelId = "root" | "type" | "font" | "color";

type Point = { x: number; y: number };

const props = defineProps({
  menuId: { type: String, required: true },
  anchorKey: { type: String, required: true },
  identityKey: { type: String, default: "" },
  placement: { type: String as () => Placement, default: "right-start" },

  gap: { type: Number, default: 8 },
  minWidth: { type: Number, default: 240 },
  openDelay: { type: Number, default: 60 },
  closeDelay: { type: Number, default: 140 },
});

const emit = defineEmits<{
  (e: "dismiss"): void;
  (e: "select", payload: any): void;
}>();

const anchorRegistry = useAnchorRegistryStore();

const scopeEl = ref<HTMLElement | null>(null);
const rootPanelEl = ref<HTMLElement | null>(null);
const sidePanelEl = ref<HTMLElement | null>(null);

const isVisible = ref(false);
const pointerInside = ref(false);

const activePanel = ref<PanelId>("root"); // cosa mostrare nel pannello destro
const hoveredRootItem = ref<PanelId | null>(null);

const styleRoot = ref<Record<string, string>>({ display: "none" });
const styleSide = ref<Record<string, string>>({ display: "none" });

const mouseHistory = ref<Point[]>([]);
const AIM_HISTORY = 2;

const rootItems: PanelId[] = ["type", "font", "color"];
const rootIndex = ref(0);
const sideIndex = ref(0);

let tOpen: number | null = null;
let tClose: number | null = null;

function clearTimers() {
  if (tOpen) window.clearTimeout(tOpen);
  if (tClose) window.clearTimeout(tClose);
  tOpen = null;
  tClose = null;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function computeRootPosition() {
  const anchorEl = anchorRegistry.getAnchorEl(props.anchorKey);
  const anchorRect = anchorEl?.getBoundingClientRect() || null;
  const panel = rootPanelEl.value;
  if (!anchorRect || !panel) return;

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const pr = panel.getBoundingClientRect();
  const w = pr.width || props.minWidth;
  const h = pr.height || 220;
  const gap = props.gap;

  let left = anchorRect.right + gap;
  let top = anchorRect.top;

  if (props.placement.startsWith("left")) left = anchorRect.left - w - gap;
  if (props.placement.startsWith("bottom")) {
    top = anchorRect.bottom + gap;
    left = anchorRect.left;
  }
  if (props.placement.startsWith("top")) {
    top = anchorRect.top - h - gap;
    left = anchorRect.left;
  }

  // flip semplice
  if (left + w > vw - 8) left = anchorRect.left - w - gap;
  if (left < 8) left = anchorRect.right + gap;

  left = clamp(left, 8, vw - w - 8);
  top = clamp(top, 8, vh - h - 8);

  styleRoot.value = {
    position: "fixed",
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`,
    minWidth: `${props.minWidth}px`,
    display: "block",
  };
}

function computeSidePosition() {
  const root = rootPanelEl.value;
  const side = sidePanelEl.value;
  if (!root || !side) return;

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const rr = root.getBoundingClientRect();
  const sr = side.getBoundingClientRect();
  const w = sr.width || props.minWidth;
  const h = sr.height || 260;

  const gap = props.gap;

  let left = rr.right + gap;
  let top = rr.top;

  // flip se overflow a destra
  if (left + w > vw - 8) left = rr.left - w - gap;

  left = clamp(left, 8, vw - w - 8);
  top = clamp(top, 8, vh - h - 8);

  styleSide.value = {
    position: "fixed",
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`,
    minWidth: `${props.minWidth}px`,
    display: activePanel.value === "root" ? "none" : "block",
  };
}

function pointInTriangle(p: Point, a: Point, b: Point, c: Point) {
  // barycentric technique
  const area = (p1: Point, p2: Point, p3: Point) =>
    Math.abs(
      (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y)) / 2,
    );

  const A = area(a, b, c);
  const A1 = area(p, b, c);
  const A2 = area(a, p, c);
  const A3 = area(a, b, p);

  return Math.abs(A - (A1 + A2 + A3)) < 0.5;
}

async function open() {
  clearTimers();
  isVisible.value = true;
  activePanel.value = "root";
  hoveredRootItem.value = null;

  await nextTick();
  computeRootPosition();
  await nextTick();
  computeSidePosition();
}

type CloseReason = "host" | "overlay" | "api";
function close(reason: CloseReason = "api") {
  clearTimers();
  if (!isVisible.value) return;

  isVisible.value = false;
  activePanel.value = "root";
  hoveredRootItem.value = null;
  styleRoot.value = { display: "none" };
  styleSide.value = { display: "none" };

  if (reason === "overlay") emit("dismiss");
}

defineExpose({
  open,
  close: () => close("host"),
  isOpen: () => isVisible.value,
});

useOverlayBindingKeyed(() => {
  if (!scopeEl.value) return null;
  return {
    id: props.menuId,
    kind: "dropdown",
    priority: 100,
    behaviour: "exclusiveKinds",
    exclusiveKinds: ["hoverbar", "dropdown"],
    identityKey: props.identityKey || null,
    isOpen: () => isVisible.value,
    open,
    requestClose: () => close("overlay"),
    getInteractionScope: () => "local",
  } as any;
});

//intent toward side panel

function isMovingTowardSidePanel(e: PointerEvent) {
  if (activePanel.value === "root") return false;
  if (!rootPanelEl.value || !sidePanelEl.value) return false;
  if (mouseHistory.value.length < 2) return false;

  const rootRect = rootPanelEl.value.getBoundingClientRect();

  const a = { x: rootRect.right, y: rootRect.top };
  const b = { x: rootRect.right, y: rootRect.bottom };
  const c = mouseHistory.value[0]; // previous

  const p = { x: e.clientX, y: e.clientY };

  return pointInTriangle(p, a, b, c);
}

// ===== hover semantics root -> side panel =====

function scheduleOpenPanel(panel: PanelId) {
  clearTimers();
  tOpen = window.setTimeout(() => {
    activePanel.value = panel;
    nextTick().then(computeSidePosition);
  }, props.openDelay);
}

function scheduleCloseAll() {
  clearTimers();
  tClose = window.setTimeout(() => {
    if (pointerInside.value) return;
    close("api");
  }, props.closeDelay);
}

function onPointerMove(e: PointerEvent) {
  mouseHistory.value.push({ x: e.clientX, y: e.clientY });
  if (mouseHistory.value.length > AIM_HISTORY) {
    mouseHistory.value.shift();
  }
}

function onScopeEnter() {
  pointerInside.value = true;
  clearTimers();
}

function onScopeLeave(e: PointerEvent) {
  pointerInside.value = false;

  const rt = e.relatedTarget as Node | null;
  if (rt && scopeEl.value?.contains(rt)) return;

  // MENU AIM: se stiamo andando verso il pannello destro → non chiudere
  if (isMovingTowardSidePanel(e)) return;

  scheduleCloseAll();
}

function onRootItemEnter(panel: PanelId) {
  hoveredRootItem.value = panel;
  scheduleOpenPanel(panel);
}

function onSelect(payload: any) {
  emit("select", payload);
  close("api");
}
//keyboard controls
function onKeyDown(e: KeyboardEvent) {
  if (!isVisible.value) return;

  if (activePanel.value === "root") {
    if (e.key === "ArrowDown") {
      rootIndex.value = (rootIndex.value + 1) % rootItems.length;
      hoveredRootItem.value = rootItems[rootIndex.value];
      e.preventDefault();
    }
    if (e.key === "ArrowUp") {
      rootIndex.value =
        (rootIndex.value - 1 + rootItems.length) % rootItems.length;
      hoveredRootItem.value = rootItems[rootIndex.value];
      e.preventDefault();
    }
    if (e.key === "ArrowRight" || e.key === "Enter") {
      scheduleOpenPanel(rootItems[rootIndex.value]);
      e.preventDefault();
    }
  } else {
    // side panel
    if (e.key === "ArrowDown") {
      sideIndex.value++;
      e.preventDefault();
    }
    if (e.key === "ArrowUp") {
      sideIndex.value = Math.max(0, sideIndex.value - 1);
      e.preventDefault();
    }
    if (e.key === "ArrowLeft") {
      activePanel.value = "root";
      e.preventDefault();
    }
    if (e.key === "Enter") {
      // delega alla select corrente
      onSelect({ panel: activePanel.value, index: sideIndex.value });
      e.preventDefault();
    }
  }
}

// reposition
function onWindowChanged() {
  if (!isVisible.value) return;
  computeRootPosition();
  computeSidePosition();
}

onMounted(() => {
  window.addEventListener("resize", onWindowChanged, { passive: true });
  window.addEventListener("scroll", onWindowChanged, {
    passive: true,
    capture: true,
  });
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", onWindowChanged);
  window.removeEventListener("scroll", onWindowChanged, true as any);
});

watch(
  () => props.anchorKey,
  () => {
    if (!isVisible.value) return;
    nextTick().then(() => {
      computeRootPosition();
      computeSidePosition();
    });
  },
);
</script>

<template>
  <Teleport to="body">
    <div
      ref="scopeEl"
      v-show="isVisible"
      class="mh-scope"
      @pointerenter="onScopeEnter"
      @pointerleave="onScopeLeave"
      @pointermove="onPointerMove"
      tabindex="0"
      @keydown="onKeyDown"
    >
      <!-- ROOT -->
      <div ref="rootPanelEl" class="mh-panel" :style="styleRoot">
        <div class="mh-list">
          <button
            class="mh-item"
            :class="{ open: hoveredRootItem === 'type' }"
            @pointerenter="onRootItemEnter('type')"
          >
            <span>Type</span><span class="mh-chev">›</span>
          </button>
          <button
            class="mh-item"
            :class="{ open: hoveredRootItem === 'font' }"
            @pointerenter="onRootItemEnter('font')"
          >
            <span>Font</span><span class="mh-chev">›</span>
          </button>
          <button
            class="mh-item"
            :class="{ open: hoveredRootItem === 'color' }"
            @pointerenter="onRootItemEnter('color')"
          >
            <span>Color</span><span class="mh-chev">›</span>
          </button>
        </div>
      </div>

      <!-- SIDE PANEL -->
      <div ref="sidePanelEl" class="mh-panel" :style="styleSide">
        <template v-if="activePanel === 'type'">
          <div class="mh-title">Type</div>
          <div class="mh-list">
            <button
              class="mh-item"
              @click="onSelect({ kind: 'type', value: 'paragraph' })"
            >
              Paragraph
            </button>
            <button
              class="mh-item"
              @click="onSelect({ kind: 'type', value: 'h1' })"
            >
              Heading 1
            </button>
            <button
              class="mh-item"
              @click="onSelect({ kind: 'type', value: 'h2' })"
            >
              Heading 2
            </button>
            <button
              class="mh-item"
              @click="onSelect({ kind: 'type', value: 'quote' })"
            >
              Quote
            </button>
          </div>
        </template>

        <template v-else-if="activePanel === 'font'">
          <div class="mh-title">Font</div>
          <div class="mh-list">
            <button
              class="mh-item"
              @click="onSelect({ kind: 'font', value: 'inter' })"
            >
              Inter
            </button>
            <button
              class="mh-item"
              @click="onSelect({ kind: 'font', value: 'serif' })"
            >
              Serif
            </button>
            <button
              class="mh-item"
              @click="onSelect({ kind: 'font', value: 'mono' })"
            >
              Mono
            </button>
          </div>
        </template>

        <template v-else-if="activePanel === 'color'">
          <div class="mh-title">Color</div>
          <div class="mh-list">
            <button
              class="mh-item"
              @click="onSelect({ kind: 'color', value: 'text.default' })"
            >
              Text default
            </button>
            <button
              class="mh-item"
              @click="onSelect({ kind: 'color', value: 'text.red' })"
            >
              Text red
            </button>
            <button
              class="mh-item"
              @click="onSelect({ kind: 'color', value: 'bg.yellow' })"
            >
              BG yellow
            </button>
          </div>
        </template>

        <template v-else>
          <div class="mh-title">—</div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.mh-scope {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9999;
}
.mh-panel {
  pointer-events: auto;
  border-radius: 12px;
  background: var(--panel-bg, #111);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
  padding: 6px;
}
.mh-title {
  font-size: 12px;
  opacity: 0.8;
  padding: 6px 8px;
}
.mh-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.mh-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 0;
  background: transparent;
  color: white;
  text-align: left;
  cursor: pointer;
}
.mh-item:hover,
.mh-item.open {
  background: rgba(255, 255, 255, 0.08);
}
.mh-chev {
  opacity: 0.7;
}
</style>
