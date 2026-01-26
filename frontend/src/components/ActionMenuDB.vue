<script setup>
import {
  ref,
  watch,
  nextTick,
  onMounted,
  onBeforeUnmount,
  computed,
  unref,
} from "vue";
import { getIconComponent } from "@/icons/catalog";

const props = defineProps({
  open: { type: Boolean, default: false },
  anchorRect: { type: Object, default: null },
  anchorEl: { type: [Object, null], default: null },
  items: { type: Array, default: () => [] },
  activeId: { type: String, default: null },

  minWidth: { type: Number, default: 220 },
  gap: { type: Number, default: 6 },

  // ✅ offset extra (oltre a gap e sideOffsetX)
  offsetX: { type: Number, default: 0 },
  offsetY: { type: Number, default: 0 },

  // compat
  viewportMargin: { type: Number, default: 25 },
  sideOffsetX: { type: Number, default: 0 },

  closeOnAction: { type: Boolean, default: true },
  custom: { type: Boolean, default: false },

  // enable internal scroll + maxHeight handling
  scroll: { type: [Boolean, String], default: false },

  placement: { type: String, default: "left" },

  // ✅ clamp PRE (usato per flip/decisioni)
  xPre: { type: Number, default: null },
  yPre: { type: Number, default: null },

  // ✅ clamp POST (safety clamp finale)
  xPost: { type: Number, default: null },
  yPost: { type: Number, default: null },

  // ✅ max size PRE (applicato nella fase misura)
  maxWPre: { type: [Number, String, null], default: null },
  maxHPre: { type: [Number, String, null], default: null },

  // ✅ max size POST (applicato quando visibile)
  maxWPost: { type: [Number, String, null], default: null },
  maxHPost: { type: [Number, String, null], default: null },

  flip: { type: [Boolean, String], default: "auto" },
});

const emit = defineEmits(["action", "close", "item-enter", "item-leave"]);

const menuEl = ref(null);
const menuStyle = ref({ display: "none" });
let scrollTimer = null;

// Dimensioni misurate (stabili durante scroll)
const measuredW = ref(0);
const measuredH = ref(0);
const measured = ref(false);

const menuItems = ref([]); // array di button

function getItemElById(id) {
  const arr = menuItems.value ?? [];
  return arr.find((btn) => btn?.dataset?.menuItemId === String(id)) ?? null;
}

function getMenuEl() {
  return menuEl.value ?? null;
}

function cssSize(v) {
  if (v == null || v === "") return null;
  return typeof v === "number" ? `${v}px` : String(v);
}

function resetMeasure() {
  measured.value = false;
  measuredW.value = 0;
  measuredH.value = 0;
  if (props.open) syncPosition();
}

defineExpose({ el: menuEl, menuItems, getItemElById, getMenuEl, resetMeasure });

function handleScroll(e) {
  const el = e?.currentTarget || null;
  if (!el) return;
  el.classList.add("is-scrolling");
  if (scrollTimer) window.clearTimeout(scrollTimer);
  scrollTimer = window.setTimeout(() => {
    el.classList.remove("is-scrolling");
    scrollTimer = null;
  }, 450);
}

const anchorElResolved = computed(() => unref(props.anchorEl) ?? null);

function computePosition(anchorRect, menuW, menuH) {
  const gap = props.gap ?? 6;

  const baseMargin = props.viewportMargin ?? 0;
  const xPre = props.xPre ?? baseMargin;
  const yPre = props.yPre ?? baseMargin;
  const xPost = props.xPost ?? baseMargin;
  const yPost = props.yPost ?? baseMargin;

  const offsetX = (props.sideOffsetX ?? 0) + (props.offsetX ?? 0);
  const offsetY = props.offsetY ?? 0;

  const place = props.placement;

  // flip policy
  const flipVal = props.flip;
  const flipNone = flipVal === false || flipVal === "none";
  const flipBoth = flipVal === true || flipVal === "both";
  const flipXOnly = flipVal === "x";
  const flipYOnly = flipVal === "y";

  const allowFlipX =
    !flipNone &&
    (flipBoth ||
      flipXOnly ||
      (flipVal === "auto" &&
        (place.startsWith("right") ||
          place.startsWith("left") ||
          place === "right" ||
          place === "left")));

  const allowFlipY =
    !flipNone &&
    (flipBoth ||
      flipYOnly ||
      (flipVal === "auto" &&
        (place.startsWith("bottom") || place.startsWith("top"))));

  let left = 0;
  let top = 0;

  // --- initial placement ---
  if (place === "right-start") {
    left = anchorRect.right + gap + offsetX;
    top = anchorRect.top + offsetY;
  } else if (place === "right-end") {
    left = anchorRect.right + gap + offsetX;
    top = anchorRect.bottom - menuH + offsetY;
  } else if (place === "left-start") {
    left = anchorRect.left - menuW + offsetX;
    top = anchorRect.top + offsetY;
  } else if (place === "left-end") {
    left = anchorRect.left - menuW + offsetX;
    top = anchorRect.bottom - menuH + offsetY;
  } else if (place === "right") {
    left = anchorRect.right + gap + offsetX;
    top = anchorRect.top + offsetY;
  } else if (place === "right-center") {
    left = anchorRect.right + gap + offsetX;
    top = anchorRect.top + (anchorRect.height - menuH) / 2 + offsetY;
  } else if (place === "bottom-start") {
    left = anchorRect.left + offsetX;
    top = anchorRect.bottom + gap + offsetY;
  } else if (place === "bottom-end") {
    left = anchorRect.right - menuW + offsetX;
    top = anchorRect.bottom + gap + offsetY;
  } else if (place === "center") {
    const ax = anchorRect.left + anchorRect.width / 2;
    const ay = anchorRect.top + anchorRect.height / 2;
    left = ax - menuW / 2 + offsetX;
    top = ay - menuH / 2 + offsetY;
  } else if (place === "center-top") {
    // centrato in X, sopra l’ancora (gap applicato in Y)
    const ax = anchorRect.left + anchorRect.width / 2;
    left = ax - menuW / 2 + offsetX;
    top = anchorRect.top - menuH - gap + offsetY;
  } else if (place === "center-bottom") {
    // centrato in X, sotto l’ancora
    const ax = anchorRect.left + anchorRect.width / 2;
    left = ax - menuW / 2 + offsetX;
    top = anchorRect.bottom + gap + offsetY;
  } else {
    // default "left" (centrato verticalmente)
    left = anchorRect.left - menuW + offsetX;
    top = anchorRect.top + (anchorRect.height - menuH) / 2 + offsetY;

    // compat: se non entra a sinistra, prova a destra
    if (left < xPre) left = anchorRect.right + gap + offsetX;
  }

  // --- PRE: flip decisions using pre padding ---
  if (allowFlipY && place.startsWith("bottom")) {
    if (top + menuH > window.innerHeight - yPre) {
      // flip sopra
      top = anchorRect.top - gap - menuH + offsetY;
    }
  }

  if (allowFlipX && (place.startsWith("right") || place === "right")) {
    if (left + menuW > window.innerWidth - xPre) {
      // flip a sinistra
      left = anchorRect.left - gap - menuW + offsetX;
    }
  }

  if (allowFlipX && (place.startsWith("left") || place === "left")) {
    if (left < xPre) {
      // flip a destra
      left = anchorRect.right + gap + offsetX;
    }
  }

  // --- POST: clamp final safety using post padding ---
  top = Math.min(top, window.innerHeight - menuH - yPost);
  top = Math.max(top, yPost);

  left = Math.min(left, window.innerWidth - menuW - xPost);
  left = Math.max(left, xPost);

  return { top, left };
}

async function measureIfNeeded() {
  if (!props.open) return;
  if (measured.value) return;

  const maxW = cssSize(props.maxWPre);
  const maxH = cssSize(props.maxHPre);

  menuStyle.value = {
    position: "fixed",
    top: "-9999px",
    left: "-9999px",
    zIndex: 2000,
    minWidth: `${props.minWidth}px`,
    visibility: "hidden",

    ...(maxW ? { maxWidth: maxW } : {}),
    ...(maxH ? { maxHeight: maxH, overflow: "auto" } : {}),
  };

  await nextTick();
  await new Promise(requestAnimationFrame);

  const el = menuEl.value;
  measuredW.value = el?.offsetWidth ?? props.minWidth;
  measuredH.value = el?.offsetHeight ?? 200;
  measured.value = true;
}

function updatePosition() {
  if (!props.open || !props.anchorRect) {
    menuStyle.value = { display: "none" };
    return;
  }

  const w = measuredW.value || props.minWidth;
  const h = measuredH.value || 200;

  const { top, left } = computePosition(props.anchorRect, w, h);

  const maxW = cssSize(props.maxWPost);
  const maxH = cssSize(props.maxHPost);

  menuStyle.value = {
    position: "fixed",
    top: `${top}px`,
    left: `${left}px`,
    zIndex: 2000,
    minWidth: `${props.minWidth}px`,
    visibility: "visible",

    ...(maxW ? { maxWidth: maxW } : {}),
    ...(maxH ? { maxHeight: maxH, overflow: "auto" } : {}),
  };
}

async function syncPosition() {
  if (!props.anchorRect) {
    menuStyle.value = { display: "none" };
    return;
  }
  if (!props.open) {
    menuStyle.value = { display: "none" };
    return;
  }
  await measureIfNeeded();
  updatePosition();
}

function pick(item) {
  if (item.disabled) return;
  emit("action", { id: item.id, payload: item.payload });
  if (props.closeOnAction) emit("close");
}

// Reset misura se cambia contenuto/parametri che impattano size
watch(
  () => [props.custom, props.minWidth, props.items],
  () => {
    measured.value = false;
    measuredW.value = 0;
    measuredH.value = 0;
    if (props.open) syncPosition();
  },
  { deep: true },
);

// Quando cambia anchorRect o open → aggiorna posizione (senza offscreen loop)
watch(
  () => [props.open, props.anchorRect],
  () => syncPosition(),
  { deep: true },
);

const resolvedScroll = computed(() => {
  // auto: comportamento “sensato”
  if (props.scroll === "auto") return props.custom ? false : true;
  return !!props.scroll;
});

const maxHeightStyle = computed(() => {
  // Se scroll è off → niente maxHeight
  if (!resolvedScroll.value) return { maxHeight: "none", overflow: "visible" };

  // scroll on → maxHeight custom o default
  const mh = props.maxHeight ?? "min(360px, calc(100vh - 16px))";

  return {
    maxHeight: typeof mh === "number" ? `${mh}px` : mh,
    overflow: "auto",
  };
});
</script>

<template>
  <Transition name="menu-pop">
    <div
      v-if="open"
      ref="menuEl"
      class="menu"
      :class="{
        'scroll-on': resolvedScroll,
        'scroll-off': resolvedScroll === false,
      }"
      :style="[menuStyle, maxHeightStyle]"
      role="menu"
      @scroll="handleScroll"
    >
      <template v-if="custom">
        <slot />
      </template>

      <ul v-else class="menuList">
        <template
          v-for="(it, idx) in items"
          :key="it.type === 'separator' ? `sep-${idx}` : it.id"
        >
          <li
            v-if="it.type === 'separator'"
            class="separator"
            role="separator"
            aria-hidden="true"
          ></li>

          <li v-else class="menuItem">
            <button
              ref="menuItems"
              class="optionBtn"
              :data-menu-item-id="it.id"
              :class="{ active: it.id === activeId, danger: !!it.danger }"
              :disabled="!!it.disabled"
              type="button"
              role="menuitem"
              @click="pick(it)"
              @pointerenter="
                emit('item-enter', { id: it.id, item: it, ev: $event })
              "
              @pointerleave="
                emit('item-leave', { id: it.id, item: it, ev: $event })
              "
            >
              <span v-if="it.icon" class="optionIcon" aria-hidden="true">{{
                it.icon
              }}</span>
              <span v-if="it.iconId">
                <component :is="getIconComponent(it.iconId)" :size="16" />
              </span>
              <span class="optionLabel">{{ it.label }}</span>
              <span v-if="it.submenu" class="optionChevron" aria-hidden="true"
                >›</span
              >
            </button>
          </li>
        </template>
      </ul>
    </div>
  </Transition>
</template>

<style scoped>
.menu {
  background: var(--bg-menu);
  border: 1.5px solid var(--border-menu);
  border-radius: 12px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.14);
  padding: 6px;
  z-index: 2000;
  color: var(--text-main);
  /* max-height: min(360px, calc(100vh - 16px));
  overflow: auto;*/
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

.optionBtn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 0;
  background: transparent;
  border-radius: 10px;
  cursor: pointer;
  text-align: left;
  color: var(--text-main);
}

.optionBtn:hover {
  background: var(--bg-hover);
}
.optionBtn:active {
  background: var(--bg-hover);
}
.optionBtn.active {
  background: var(--bg-hover);
}

.optionBtn.danger:hover {
  background: var(--bg-menu-danger);
  color: var(--text-danger);
}

.optionBtn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.optionIcon {
  width: 22px;
  display: inline-flex;
  justify-content: center;
}
.optionLabel {
  font-size: 14px;
  line-height: 1.2;
}

/* animazione */
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
.optionChevron {
  margin-left: auto;
  opacity: 0.55;
}
.optionBtn:disabled .optionChevron {
  opacity: 0.35;
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
