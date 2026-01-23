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
  | "right"
  | "left-start"
  | "left"
  | "bottom-start"
  | "bottom-end"
  | "top-start"
  | "top-end";

type MenuItem = {
  id: string;
  label: string;
  disabled?: boolean;
  action?: () => void;
  children?: MenuItem[];
};

const props = defineProps({
  menuId: { type: String, required: true },
  anchorKey: { type: String, required: true },
  identityKey: { type: String, required: false, default: "" },
  placement: { type: String as () => Placement, default: "right-start" },

  // data menu: per ora lo passiamo diretto (poi lo colleghiamo ai tuoi items reali)
  items: { type: Array as () => MenuItem[], default: () => [] },

  gap: { type: Number, default: 6 },
  minWidth: { type: Number, default: 220 },

  openDelay: { type: Number, default: 80 },
  closeDelay: { type: Number, default: 180 },
  closeOnAction: { type: Boolean, default: true },
});

const emit = defineEmits<{
  (e: "dismiss"): void;
  (e: "close"): void;
  (e: "action", id: string): void;
}>();

// ====== overlay infra: scope + open/close ======
const isVisible = ref(false);

// scope unico che contiene tutti i pannelli (importantissimo per click-outside & hover)
const scopeEl = ref<HTMLElement | null>(null);

// pannello livello 0 (root)
const rootPanelEl = ref<HTMLElement | null>(null);

// rect/pos
const anchors = useAnchorRegistryStore();
const styleRoot = ref<Record<string, string>>({ display: "none" });

// path aperto: ids per livello
const openPath = ref<string[]>([]);

// hover tracking: se pointer è dentro scope
const pointerInside = ref(false);

// timers
let tOpen: number | null = null;
let tClose: number | null = null;

function clearTimers() {
  if (tOpen) window.clearTimeout(tOpen);
  if (tClose) window.clearTimeout(tClose);
  tOpen = null;
  tClose = null;
}

// ====== positioning helpers ======
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function computeRootPosition() {
  const anchorEl = anchors.getAnchorEl(props.anchorKey);
  const anchorRect = anchorEl?.getBoundingClientRect() || null;
  if (!anchorRect)
    return console.warn("CascadingHoverMenuController: anchorEl not found");
  const panel = rootPanelEl.value;
  if (!anchorRect || !panel) return;

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // misura panel
  const pr = panel.getBoundingClientRect();
  const panelW = pr.width || props.minWidth;
  const panelH = pr.height || 200;

  const gap = props.gap;

  // default pos: right-start
  let left = anchorRect.right + gap;
  let top = anchorRect.top;

  const pl = props.placement;

  if (pl.startsWith("left")) left = anchorRect.left - panelW - gap;
  if (pl.startsWith("right")) left = anchorRect.right + gap;

  if (pl.startsWith("bottom")) {
    top = anchorRect.bottom + gap;
    left = pl.endsWith("end") ? anchorRect.right - panelW : anchorRect.left;
  }

  if (pl.startsWith("top")) {
    top = anchorRect.top - panelH - gap;
    left = pl.endsWith("end") ? anchorRect.right - panelW : anchorRect.left;
  }

  // flip semplice orizzontale
  const overflowRight = left + panelW > vw - 8;
  const overflowLeft = left < 8;

  if (overflowRight && pl.startsWith("right")) {
    left = anchorRect.left - panelW - gap;
  } else if (overflowLeft && pl.startsWith("left")) {
    left = anchorRect.right + gap;
  }

  // clamp viewport
  left = clamp(left, 8, vw - panelW - 8);
  top = clamp(top, 8, vh - panelH - 8);

  styleRoot.value = {
    position: "fixed",
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`,
    minWidth: `${props.minWidth}px`,
    display: "block",
  };
}

function open() {
  clearTimers();
  isVisible.value = true;
  openPath.value = [];
  nextTick().then(() => {
    computeRootPosition();
  });
}

type CloseReason = "host" | "overlay" | "api";

function close(reason: CloseReason = "api") {
  clearTimers();
  if (!isVisible.value) return; // guard

  isVisible.value = false;
  openPath.value = [];
  styleRoot.value = { display: "none" };

  // IMPORTANTISSIMO: emetti SOLO quando la chiusura arriva da overlay infra (outside)
  if (reason === "overlay") {
    emit("dismiss");
  }
}

defineExpose({
  open,
  close: () => close("host"), // <-- host-close "silenziosa"
  dismiss: () => close("overlay"), // <-- opzionale, per debug/manuale
  isOpen: () => isVisible.value,
});

// ====== overlay binding keyed (priorità/click outside/top) ======
useOverlayBindingKeyed(() => {
  if (!scopeEl.value) return null;
  return {
    id: props.menuId,
    identityKey: props.identityKey || null,

    isOpen: () => isVisible.value,
    open,
    requestClose: () => close("overlay"),

    // IMPORTANT: tutto l'hoverable sta dentro scopeEl
    getInteractionScope: () => "local",
  } as any;
});

// ====== hover semantics (v1: delay + bridge) ======
function scheduleClose() {
  clearTimers();
  tClose = window.setTimeout(() => {
    // se pointer è ancora dentro, non chiudere
    if (pointerInside.value) return;
    close("api");
  }, props.closeDelay);
}

function scheduleOpenSub(level: number, itemId: string) {
  console.log("scheduleOpenSub", level, itemId);
  clearTimers();
  tOpen = window.setTimeout(() => {
    // set path fino a level e aggiungi itemId
    const next = openPath.value.slice(0, level);
    next[level] = itemId;
    openPath.value = next;
  }, props.openDelay);
}

function closeFromLevel(level: number) {
  openPath.value = openPath.value.slice(0, level);
}

function onScopePointerEnter() {
  pointerInside.value = true;
  clearTimers();
}

function onScopePointerLeave(e: PointerEvent) {
  pointerInside.value = false;
  // Se relatedTarget è ancora dentro scope, ignora
  const rt = e.relatedTarget as Node | null;
  if (rt && scopeEl.value?.contains(rt)) return;
  scheduleClose();
}

// ====== item handlers ======
function isOpenAt(level: number, id: string) {
  return openPath.value[level] === id;
}

function onItemEnter(level: number, item: MenuItem) {
  console.log("onItemEnter", level, item);
  if (item.disabled) return;

  if (item.children?.length) {
    scheduleOpenSub(level, item.id);
  } else {
    // leaf: chiudi deeper
    closeFromLevel(level);
  }
}

function onItemClick(level: number, item: MenuItem) {
  if (item.disabled) return;

  if (item.children?.length) {
    // se clic su item parent, toggle (opzionale)
    const openNow = isOpenAt(level, item.id);
    if (openNow) closeFromLevel(level);
    else {
      const next = openPath.value.slice(0, level);
      next[level] = item.id;
      openPath.value = next;
    }
    return;
  }

  item.action?.();
  emit("action", item.id);

  if (props.closeOnAction) close("api");
}

// ====== auto reposition ======
function onWindowChanged() {
  if (!isVisible.value) return;
  computeRootPosition();
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

// se cambia anchorKey mentre aperto
watch(
  () => props.anchorKey,
  () => {
    if (!isVisible.value) return;
    nextTick().then(computeRootPosition);
  },
);
</script>

<template>
  <Teleport to="body">
    <!-- scope unico: include root + eventuali submenu panels (v2) -->
    <div
      ref="scopeEl"
      v-show="isVisible"
      class="menu-scope"
      @pointerenter="onScopePointerEnter"
      @pointerleave="onScopePointerLeave"
    >
      <!-- ROOT PANEL -->
      <div ref="rootPanelEl" class="menu-panel" :style="styleRoot">
        <div class="menu-list">
          <button
            v-for="it in items"
            :key="it.id"
            class="menu-item"
            :class="{ disabled: !!it.disabled, open: isOpenAt(0, it.id) }"
            type="button"
            @pointerenter="onItemEnter(0, it)"
            @click="onItemClick(0, it)"
          >
            <span class="label">{{ it.label }}</span>
            <span v-if="it.children?.length" class="chev">›</span>
          </button>
        </div>
      </div>

      <!-- BRIDGE anti-gap (v1 semplice)
           copre una zona tra anchor e pannello: utile se placement right/left.
           In v2 lo calcoliamo preciso; intanto lo lasciamo "larga" -->
      <div class="menu-bridge" aria-hidden="true"></div>

      <!-- SUBMENU PANELS: v2 (per ora render placeholder) -->
      <!-- Ti lascio già lo slot per iterare openPath e renderizzare livelli -->
      <!-- In v2: pannello livello 1/2/3 con positioning relativo al parent item rect -->
    </div>
  </Teleport>
</template>

<style scoped>
.menu-scope {
  position: fixed;
  inset: 0;
  pointer-events: none; /* lo scope non blocca click, solo i panel */
  z-index: 9999; /* o gestito dal tuo overlayStore */
}

.menu-panel {
  pointer-events: auto;
  border-radius: 12px;
  background: var(--panel-bg, #111);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
  padding: 6px;
}

.menu-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.menu-item {
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

.menu-item:hover {
  background: rgba(255, 255, 255, 0.08);
}

.menu-item.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.menu-item.open {
  background: rgba(255, 255, 255, 0.08);
}

.label {
  font-size: 13px;
  line-height: 1.2;
}

.chev {
  opacity: 0.7;
}

.menu-bridge {
  position: fixed;
  pointer-events: auto;
  /* v1: bridge “generoso” a destra del viewport.
     In v2 lo calcoliamo tra anchorRect e panelRect */
  top: 0;
  bottom: 0;
  left: 0;
  width: 0;
}
</style>
