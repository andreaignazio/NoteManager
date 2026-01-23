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
import {
  buildRootMenu,
  buildTypePanel,
  buildColorPanel,
  buildFontPanel,
} from "@/domain/hoverMenuBuilders";
import { useHoverMenuActions } from "@/composables/useHoverMenuActions";

import MenuItemRow from "@/components/menu/MenuItemRow.vue";
import type { HoverMenuNode } from "@/domain/hoverMenu";

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

  // context utile per azioni (tiptap / block)
  blockId: { type: String, default: "" },
  pageId: { type: String, default: "" },

  // flags legacy (per root actions)
  enableCopyLink: { type: Boolean, default: false },
  enableComment: { type: Boolean, default: false },

  gap: { type: Number, default: 6 },
  minWidth: { type: Number, default: 220 },
  maxHeight: {
    type: [Number, String],
    default: "min(360px, calc(100vh - 16px))",
  },

  openDelay: { type: Number, default: 60 },
  closeDelay: { type: Number, default: 140 },
});

const emit = defineEmits<{
  (e: "dismiss"): void; // click outside (overlay infra)
  (e: "action", payload: any): void; // bubble per host/app (move_to/duplicate/delete...)
}>();

const anchorRegistry = useAnchorRegistryStore();

const isVisible = ref(false);
const scopeEl = ref<HTMLElement | null>(null);
const rootPanelEl = ref<HTMLElement | null>(null);
const sidePanelEl = ref<HTMLElement | null>(null);

const styleRoot = ref<Record<string, string>>({ display: "none" });
const styleSide = ref<Record<string, string>>({ display: "none" });

const activePanel = ref<PanelId>("root"); // cosa mostrare nel pannello destro

const pointerInside = ref(false);

const hoveredRootItem = ref<PanelId | null>(null);

// ====== builders reali ======
const FONT_PACK = [
  { id: "default", label: "Default", css: "var(--font-default)" },
  { id: "serif", label: "Serif", css: "var(--font-serif)" },
  { id: "mono", label: "Mono", css: "var(--font-mono)" },
  { id: "soft", label: "Soft", css: "var(--font-soft)" },
];

// root menu legacy, ma con disabled dinamici
const rootItems = computed<HoverMenuNode[]>(() => {
  const base = buildRootMenu();

  return base.map((n) => {
    if (n.kind !== "item") return n;

    if (n.id === "copy_link") return { ...n, disabled: !props.enableCopyLink };
    if (n.id === "comment") return { ...n, disabled: !props.enableComment };

    return n;
  });
});

const panels = computed<Record<Exclude<PanelId, "root">, HoverMenuNode[]>>(
  () => ({
    type: buildTypePanel(),
    color: buildColorPanel(),
    font: buildFontPanel(FONT_PACK),
  }),
);

function panelTitle(panel: Exclude<PanelId, "root">) {
  if (panel === "type") return "Block style";
  if (panel === "color") return "Color";
  return "Font";
}

// secondary per pannello (Type/Font sì, Color no)
function shouldShowSecondary(panel: PanelId) {
  return panel === "type" || panel === "font";
}

const mouseHistory = ref<Point[]>([]);
const AIM_HISTORY = 2;

//const rootItems: PanelId[] = ["type", "font", "color"];
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

/*function pointInTriangle(p: Point, a: Point, b: Point, c: Point) {
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
}*/

/*
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
});*/

async function open() {
  isVisible.value = true;
  activePanel.value = "root";
  await nextTick();
  computeRootPosition();
  await nextTick();
  computeSidePosition();
}

type CloseReason = "host" | "overlay" | "api";
function close(reason: CloseReason = "api") {
  if (!isVisible.value) return;
  isVisible.value = false;
  activePanel.value = "root";
  styleRoot.value = { display: "none" };
  styleSide.value = { display: "none" };
  if (reason === "overlay") emit("dismiss");
}

defineExpose({
  open,
  close: () => close("host"),
  isOpen: () => isVisible.value,
});

//===OVERLAY BINDING =====
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

/*function isMovingTowardSidePanel(e: PointerEvent) {
  if (activePanel.value === "root") return false;
  if (!rootPanelEl.value || !sidePanelEl.value) return false;
  if (mouseHistory.value.length < 2) return false;

  const rootRect = rootPanelEl.value.getBoundingClientRect();

  const a = { x: rootRect.right, y: rootRect.top };
  const b = { x: rootRect.right, y: rootRect.bottom };
  const c = mouseHistory.value[0]; // previous

  const p = { x: e.clientX, y: e.clientY };

  return pointInTriangle(p, a, b, c);
}*/

// ===== Hover + click dispatch (NO switch nel controller) =====
const ctx = computed(() => ({
  blockId: props.blockId || undefined,
  pageId: props.pageId || undefined,
}));

function openPanel(panel: "type" | "color" | "font") {
  activePanel.value = panel;
  nextTick().then(computeSidePosition);
}

// Qui colleghi le azioni reali (tiptap / store / appActions).
// Per ora mando tutto fuori con emit("action", ...), così il controller non si sporca.
const menuActions = useHoverMenuActions({
  openPanel,

  applyBlockType: async (ctx, blockType) =>
    emit("action", { type: "applyBlockType", ctx, blockType }),
  setTextColor: async (ctx, token) =>
    emit("action", { type: "setTextColor", ctx, token }),
  setBgColor: async (ctx, token) =>
    emit("action", { type: "setBgColor", ctx, token }),
  setFont: async (ctx, fontId) =>
    emit("action", { type: "setFont", ctx, fontId }),

  custom: async (ctx, id, payload) =>
    emit("action", { type: "custom", ctx, id, payload }),
});

async function onNodeClick(node: HoverMenuNode) {
  await menuActions.run(node, ctx.value);

  // chiudi solo sui leaf (non quando stai aprendo un pannello)
  if (node.kind === "item" && node.action?.type !== "openPanel") {
    close("api");
  }
}
/*function onNodeEnter(node: HoverMenuNode) {
  // apri pannelli su hover
  if (node.kind === "item" && node.action?.type === "openPanel") {
    openPanel(node.action.panel);
  }
}*/

let sideCloseTimer: number | null = null;

function clearSideCloseTimer() {
  if (sideCloseTimer) {
    window.clearTimeout(sideCloseTimer);
    sideCloseTimer = null;
  }
}

function onRootItemEnter(node: HoverMenuNode, ev?: PointerEvent) {
  if (node.kind !== "item") return;
  clearSideCloseTimer();

  const isPanelOpener =
    node.action?.type === "openPanel" || !!node.children?.length;

  if (node.action?.type === "openPanel") {
    openPanel(node.action.panel);
    return;
  }

  // root leaf: chiudi laterale con delay, MA non se stai puntando verso side
  if (!isPanelOpener && activePanel.value !== "root") {
    if (ev && isAimingToSide(ev)) return;

    sideCloseTimer = window.setTimeout(() => {
      activePanel.value = "root";
      nextTick().then(computeSidePosition);
      sideCloseTimer = null;
    }, 80);
  }
}

function onSideItemEnter(_node: HoverMenuNode) {
  clearSideCloseTimer();
}

// ===== scroll style semplice (intuitivo) =====
const panelScrollStyle = computed(() => {
  const mh = props.maxHeight;
  return {
    maxHeight: typeof mh === "number" ? `${mh}px` : String(mh),
    overflow: "auto",
  };
});

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
  clearSideCloseTimer();
  pointerInside.value = true;
  clearTimers();
}

function onScopeLeave(e: PointerEvent) {
  pointerInside.value = false;

  const rt = e.relatedTarget as Node | null;
  if (rt && scopeEl.value?.contains(rt)) return;

  // MENU AIM: se stiamo andando verso il pannello destro → non chiudere
  // if (isMovingTowardSidePanel(e)) return;
  if (isAimingToSide(e)) return; // ✅ evita close globale mentre vai verso side
  scheduleCloseAll();
}

type Pt = { x: number; y: number };

const mouseTrail = ref<Pt[]>([]);
const AIM_TRAIL = 2;

function onScopePointerMove(e: PointerEvent) {
  mouseTrail.value.push({ x: e.clientX, y: e.clientY });
  if (mouseTrail.value.length > AIM_TRAIL) mouseTrail.value.shift();
}
function area(p1: Pt, p2: Pt, p3: Pt) {
  return Math.abs(
    (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y)) / 2,
  );
}

function pointInTriangle(p: Pt, a: Pt, b: Pt, c: Pt) {
  const A = area(a, b, c);
  const A1 = area(p, b, c);
  const A2 = area(a, p, c);
  const A3 = area(a, b, p);
  return Math.abs(A - (A1 + A2 + A3)) < 0.5;
}
function isAimingToSide(e: PointerEvent) {
  if (activePanel.value === "root") return false;
  if (!rootPanelEl.value || !sidePanelEl.value) return false;
  if (mouseTrail.value.length < 2) return false;

  const rr = rootPanelEl.value.getBoundingClientRect();
  const prev = mouseTrail.value[0]; // posizione precedente

  // Triangolo sul lato destro della root
  const a = { x: rr.right, y: rr.top };
  const b = { x: rr.right, y: rr.bottom };
  const c = prev;

  const p = { x: e.clientX, y: e.clientY };
  return pointInTriangle(p, a, b, c);
}

/*function onRootItemEnter(panel: PanelId) {
  hoveredRootItem.value = panel;
  scheduleOpenPanel(panel);
}*/

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
      @pointermove="onScopePointerMove"
    >
      <!-- ROOT PANEL -->
      <Transition name="menu-pop">
        <div
          v-show="isVisible"
          ref="rootPanelEl"
          class="menu"
          :style="[styleRoot, panelScrollStyle]"
        >
          <ul class="menuList">
            <template v-for="n in rootItems" :key="n.id">
              <li
                v-if="n.kind === 'separator'"
                class="separator"
                role="separator"
                aria-hidden="true"
              ></li>

              <li v-else class="menuItem">
                <MenuItemRow
                  :id="n.id"
                  :label="n.label"
                  :secondary="''"
                  :icon="n.icon || ''"
                  :iconId="n.iconId || ''"
                  :danger="!!n.danger"
                  :disabled="!!n.disabled"
                  :active="
                    activePanel !== 'root' &&
                    n.action?.type === 'openPanel' &&
                    n.action.panel === activePanel
                  "
                  :hasSubmenu="
                    n.action?.type === 'openPanel' || !!n.children?.length
                  "
                  @enter="(ev) => onRootItemEnter(n, ev)"
                  @click="() => onNodeClick(n)"
                />
              </li>
            </template>
          </ul>
        </div>
      </Transition>

      <!-- SIDE PANEL -->
      <Transition name="menu-pop">
        <div
          v-show="activePanel !== 'root'"
          ref="sidePanelEl"
          class="menu"
          :style="[styleSide, panelScrollStyle]"
        >
          <ul class="menuList">
            <li class="panelTitle" aria-hidden="true">
              {{ activePanel !== "root" ? panelTitle(activePanel) : "" }}
            </li>

            <template
              v-for="n in activePanel === 'root' ? [] : panels[activePanel]"
              :key="n.id"
            >
              <li
                v-if="n.kind === 'separator'"
                class="separator"
                role="separator"
                aria-hidden="true"
              ></li>

              <li v-else class="menuItem">
                <MenuItemRow
                  :id="n.id"
                  :label="n.label"
                  :secondary="
                    shouldShowSecondary(activePanel) ? n.hint || '' : ''
                  "
                  :icon="n.icon || ''"
                  :iconId="n.iconId || ''"
                  :danger="!!n.danger"
                  :disabled="!!n.disabled"
                  :active="false"
                  :hasSubmenu="
                    n.action?.type === 'openPanel' || !!n.children?.length
                  "
                  @enter="() => onSideItemEnter(n)"
                  @click="() => onNodeClick(n)"
                />
              </li>
            </template>
          </ul>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>

<style scoped>
/* scope */
.mh-scope {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9999; /* o gestito da overlay store */
}

/* menu legacy style (match perfetto) */
.menu {
  pointer-events: auto;
  background: var(--bg-menu);
  border: 1.5px solid var(--border-menu);
  border-radius: 12px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.14);
  padding: 6px;
  color: var(--text-main);
}

.menuList {
  list-style: none;
  margin: 0;
  padding: 0;
}

.menuItem {
  margin: 0;
  padding: 0;
}

.separator {
  height: 1px;
  margin: 6px 6px;
  background: var(--border-menu);
}

/* panel title */
.panelTitle {
  font-size: 12px;
  opacity: 0.75;
  padding: 6px 8px;
}

/* animazione legacy */
.menu-pop-enter-active,
.menu-pop-leave-active {
  transition:
    opacity 120ms ease,
    transform 120ms ease;
}
.menu-pop-enter-from,
.menu-pop-leave-to {
  opacity: 0;
  transform: scale(0.98);
  transform-origin: top left;
}
.menu-pop-enter-to,
.menu-pop-leave-from {
  opacity: 1;
  transform: scale(1);
}
.menu::-webkit-scrollbar {
  width: 13px;
}
.menu::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.18);
  border-radius: 10px;
  border: 3px solid transparent;
  background-clip: content-box;
}
.menu::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.26);
}
</style>
