<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import router from "@/router";
import { storeToRefs } from "pinia";
import useAuthStore from "@/stores/auth";
import usePagesStore from "@/stores/pages";
import { useUiStore } from "@/stores/ui";
import { useOverlayStore } from "@/stores/overlay";
import { useOverlayLayer } from "@/composables/useOverlayLayer";
import PieMenu from "@/components/menu/PieMenu.vue";
import PieColorMenu from "@/components/menu/PieColorMenu.vue";
import PieHighlightMenu from "@/components/menu/PieHighlightMenu.vue";
import PieBlockTypeMenu from "@/components/menu/PieBlockTypeMenu.vue";
import FlyoutSidebar from "@/components/shell/FlyoutSidebar.vue";
import PagesSidebar from "@/components/shell/PagesSidebar.vue";
import Topbar from "@/components/shell/Topbar.vue";
import { useAppActions } from "@/actions/useAppActions";
import OverlayHost from "@/components/shell/OverlayHost.vue";
import usePieMenuShell from "@/composables/usePieMenuShell";

const authStore = useAuthStore();
const pagesStore = usePagesStore();
const ui = useUiStore();
const overlay = useOverlayStore();
const actions = useAppActions();
ui.hydrate();

const errorMsg = ref("");

const overlayHasAny = computed(() => overlay.hasAny);
const closeOnOutside = computed(
  () => overlay.top?.options?.closeOnOutside !== false,
);
const stopPointerOutside = computed(
  () => overlay.top?.options?.stopPointerOutside !== false,
);

const showBackdrop = computed(() => {
  if (overlayHasAny.value && stopPointerOutside.value) return true;
  return false;
});

function onBackdropPointerDown(e) {
  console.log("OnBackdropPointerDown");
  e.preventDefault();
  e.stopPropagation();

  if (closeOnOutside.value) overlay.closeTop();
}

function onBackdropWheel(e) {
  // se vuoi bloccare scroll sotto mentre c’è overlay
  //if(stopPointerOutside.value){
  e.preventDefault();
  e.stopPropagation();
}

const { editingPageId } = storeToRefs(pagesStore);

const dockedSidebarRef = ref(null);

//===FLYOUT-OVERLAY===
const flyoutId = "flyout";
const flyoutSidebarRef = ref(null); //Dumb DOM element
const flyoutOpen = ref(false); //Reference that know when flyout is open
const flyoutHitArea = ref(null); //Area that trigger flyout opening

function onFlyoutClose() {
  flyoutOpen.value = false;
}

//const flyoutActive = computed(()=> overlay.activeId === flyoutId)

const flyoutLayer = useOverlayLayer("flyout", () => ({
  getMenuEl: () => flyoutSidebarRef.value?.panelEl?.value ?? null,
  getAnchorEl: () => flyoutHitArea.value,
  close: onFlyoutClose,
  options: {
    closeOnEsc: true,
    closeOnOutside: false,
    stopPointerOutside: false,
    lockScroll: false,
    restoreFocus: false,
  },
}));

flyoutLayer.syncOpen(flyoutOpen);
const flyoutActive = flyoutLayer.isActive;

const isDocked = computed(() => ui.sidebarMode === "docked");
const isHidden = computed(() => ui.sidebarMode === "hidden");

const activeSidebarRef = computed(() => {
  if (isDocked.value) return dockedSidebarRef.value;
  if (flyoutOpen.value) return flyoutSidebarRef.value;
  return null;
});

async function fetchPages() {
  try {
    await actions.pages.fetchPages();
  } catch {
    errorMsg.value = "Error while loading pages";
  }
}

async function checkRouteAndFetchPages() {
  if (!authStore?.isAuthenticated) return;
  await fetchPages();
  const routeId = router.currentRoute.value?.params?.id ?? null;
  if (routeId && !pagesStore.pagesById[routeId]) {
    router.push("/");
  } else {
    actions.pages.ensureVisible(routeId);
  }
}

async function _init() {
  ui.hydrate();
  if (!authStore?.isAuthenticated) return;
  await fetchPages();
  // apri l’ultima pagina aperta se esiste
  const lastOpenedPageId = ui.lastOpenedPageId;
  console.log("Last opened page id:", lastOpenedPageId);
  if (lastOpenedPageId && pagesStore.pagesById[lastOpenedPageId]) {
    actions.pages.redirectToPage(lastOpenedPageId);
  } else if (pagesStore.anyPage) {
    const firstPageId = pagesStore.childrenByParentId[null]?.[0] ?? null;
    if (firstPageId) {
      actions.pages.redirectToPage(firstPageId);
    }
  } else {
    actions.pages.createChildAndActivate(null);
  }
}

onMounted(_init);

const handleLogout = async () => {
  try {
    overlay.clear?.();
    flyoutOpen.value = false;
    await authStore.logout();
    router.push("/login");
  } catch {
    errorMsg.value = "Logout error";
  }
};

// ====== Sidebar mode toggling policy ======
function closeAllSidebarTransientUi() {
  // chiudi menu e editing per sicurezza (policy semplice)
  //pagesStore.closeContextMenu();
  if (editingPageId.value !== null) actions.pages.cancelEdit();

  flyoutOpen.value = false;
}

watch(
  () => ui.sidebarMode,
  (mode) => {
    if (mode === "hidden") {
      // quando vai hidden, chiudi roba volatile
      closeAllSidebarTransientUi();
    } else {
      // docked: flyout non serve
      flyoutOpen.value = false;
    }
  },
);

// ====== Hover behaviour for flyout ======
let openTimer = null;

function clearOpenTimer() {
  if (openTimer) clearTimeout(openTimer);
  openTimer = null;
}

function onFlyoutHitEnter() {
  if (!isHidden.value) return;
  clearOpenTimer();
  openTimer = setTimeout(() => {
    flyoutOpen.value = true;
    // (opzionale) nextTick per stabilizzare rect/menu
    nextTick(() => activeSidebarRef.value?.updateMenuRectIfOpen?.());
  }, 80);
}

function onFlyoutHitLeave() {
  clearOpenTimer();
  // la chiusura vera viene gestita dal FlyoutSidebar hover intent (emit close)
}

// --- Docked resize (AppShell) ---
const isResizingSidebar = ref(false);

let resizePointerId = null;
let resizeStartX = 0;
let resizeStartWidth = 0;

function onResizeHandlePointerDown(e) {
  if (!isDocked.value) return;

  isResizingSidebar.value = true;
  resizePointerId = e.pointerId;
  resizeStartX = e.clientX;
  resizeStartWidth = ui.sidebarWidth;

  // cattura pointer per non perdere il drag se esci dal bordo
  e.currentTarget?.setPointerCapture?.(e.pointerId);

  // migliora UX (no selezione testo mentre trascini)
  document.documentElement.style.cursor = "col-resize";
  document.documentElement.style.userSelect = "none";
}

function onResizeHandlePointerMove(e) {
  if (!isResizingSidebar.value) return;
  if (resizePointerId !== e.pointerId) return;

  const dx = e.clientX - resizeStartX;
  const nextWidth = resizeStartWidth + dx;
  ui.setSidebarWidth(nextWidth);
}

function endSidebarResize(e) {
  if (!isResizingSidebar.value) return;
  // se arriva un pointerup senza pointerId (es. chiamato manualmente), ok lo stesso
  if (
    e?.pointerId != null &&
    resizePointerId != null &&
    e.pointerId !== resizePointerId
  )
    return;

  isResizingSidebar.value = false;
  resizePointerId = null;

  document.documentElement.style.cursor = "";
  document.documentElement.style.userSelect = "";
}
// ====== Topbar Hiding ======
let mouseRevealTimer = null;
let mouseHideTimer = null;
const MOUSE_TIME = 1200;

function isEditorEl(el) {
  if (!el || !(el instanceof HTMLElement)) return false;
  // titolo
  if (el.classList?.contains("page-title-input")) return true;
  // block editor
  if (el.dataset?.blockEditor === "true") return true;
  return false;
}

function clearMouseTimers() {
  if (mouseRevealTimer) clearTimeout(mouseRevealTimer);
  if (mouseHideTimer) clearTimeout(mouseHideTimer);
  mouseRevealTimer = null;
  mouseHideTimer = null;
}

// ====== Global listeners  ======

function onGlobalFocusIn(e) {
  clearTimeout(mouseHideTimer);
  const t = e.target;
  if (isEditorEl(t)) ui.setTopbarHidden(true);
}

function onGlobalFocusOut() {
  // aspetta che activeElement si stabilizzi
  clearTimeout(mouseHideTimer);
  requestAnimationFrame(() => {
    const el = document.activeElement;
    ui.setTopbarHidden(isEditorEl(el));
  });
}

function onWindowResize() {
  activeSidebarRef.value?.updateMenuRectIfOpen?.();
}

function onGlobalMouseMove() {
  // mostra sempre quando il mouse si muove
  ui.setTopbarHidden(false);

  // se stai ancora editando, pianifica di rinascodere dopo un attimo di inattività
  clearTimeout(mouseHideTimer);
  mouseHideTimer = setTimeout(() => {
    const el = document.activeElement;
    if (isEditorEl(el)) ui.setTopbarHidden(true);
  }, MOUSE_TIME); // <- regola: 600–1200ms
}

onMounted(() => {
  window.addEventListener("resize", onWindowResize, { passive: true });

  // resize listeners
  window.addEventListener("pointermove", onResizeHandlePointerMove, {
    passive: true,
  });
  window.addEventListener("pointerup", endSidebarResize, { passive: true });
  window.addEventListener("pointercancel", endSidebarResize, { passive: true });
  //Focus listeners
  window.addEventListener("focusin", onGlobalFocusIn, true);
  window.addEventListener("focusout", onGlobalFocusOut, true);

  window.addEventListener("mousemove", onGlobalMouseMove, { passive: true });
});

onUnmounted(() => {
  clearOpenTimer();
  window.removeEventListener("resize", onWindowResize);

  // resize listeners cleanup
  window.removeEventListener("pointermove", onResizeHandlePointerMove);
  window.removeEventListener("pointerup", endSidebarResize);
  window.removeEventListener("pointercancel", endSidebarResize);
  //Focus listeners
  window.removeEventListener("focusin", onGlobalFocusIn, true);
  window.removeEventListener("focusout", onGlobalFocusOut, true);

  window.removeEventListener("mousemove", onGlobalMouseMove);
  clearMouseTimers();

  // safety: se unmount mentre stai trascinando
  document.documentElement.style.cursor = "";
  document.documentElement.style.userSelect = "";
});

const isLoginRoute = computed(
  () =>
    router.currentRoute.value?.name === "login" ||
    router.currentRoute.value?.path === "/login",
);

// ====== PIE MENU CONTROLLER ======
const {
  TEXT_TOKENS,
  BG_TOKENS,
  pieOpen,
  pieMode,
  pieArea,
  pieAnchorX,
  pieAnchorY,
  pieCenter,
  pieContext,
  pieTop,
  pieController,
  mainMenuRef,
  colorPieRef,
  highlightPieRef,
  typePieRef,
  currentText,
  currentBg,
  currentBlockType,
  labelForBg,
  labelForText,
  letterStyleForText,
  swatchStyleForBg,
  HIGHLIGHT_COLORS,
} = usePieMenuShell();
</script>

<template>
  <router-view v-if="isLoginRoute" />

  <div v-else class="shell" ref="mainshelldoc">
    <div class="layout">
      <!-- DOCKED SIDEBAR (100vh) -->
      <div
        data-pie-area="sidebar"
        v-if="isDocked"
        class="sidebar-docked test"
        :style="{ width: ui.sidebarWidth + 'px' }"
        :class="{ 'pie-move-armed': ui.SidebarMoveToArmed }"
      >
        <PagesSidebar
          @logout="handleLogout"
          ref="dockedSidebarRef"
          variant="docked"
          :indentPx="24"
        />

        <div
          class="sidebar-resize-handle"
          role="separator"
          aria-orientation="vertical"
          :aria-valuenow="ui.sidebarWidth"
          :aria-valuemin="ui.sidebarMinWidth"
          :aria-valuemax="ui.sidebarMaxWidth"
          @pointerdown="onResizeHandlePointerDown"
        />
      </div>

      <!-- CONTENT AREA (Topbar + router view) -->
      <div class="content-area" data-pie-area="main">
        <Topbar class="app-topbar" :class="{ hidden: ui.topbarHidden }">
        </Topbar>

        <main class="content" @pointerdown="onBlankPointer">
          <div class="content-scroll scrollbar-auto">
            <div v-if="errorMsg" class="error">{{ errorMsg }}</div>
            <router-view />
          </div>
        </main>
      </div>

      <!-- HIT AREA per flyout (solo quando hidden) -->
      <div
        v-if="isHidden"
        ref="flyoutHitArea"
        class="flyout-hit-area"
        @pointerenter="onFlyoutHitEnter"
        @pointerleave="onFlyoutHitLeave"
      />
    </div>

    <!-- FLYOUT -->
    <FlyoutSidebar
      v-if="isHidden"
      :open="flyoutOpen"
      :active="flyoutActive"
      :width="ui.sidebarWidth"
      :minWidth="ui.sidebarMinWidth"
      :maxWidth="ui.sidebarMaxWidth"
      :topOffset="ui.topbarHeight"
      :heightRatio="0.8"
      @resize="ui.setSidebarWidth($event)"
      @close="onFlyoutClose"
    >
      <PagesSidebar ref="flyoutSidebarRef" variant="flyout" :indentPx="24" />
    </FlyoutSidebar>
  </div>

  <Teleport to="body">
    <PieMenu
      ref="mainMenuRef"
      v-show="pieOpen && overlay.has('pie') && pieTop === 'main'"
      :open="pieOpen && overlay.has('pie') && pieTop === 'main'"
      :x="pieAnchorX"
      :y="pieAnchorY"
      :centerX="pieCenter.x"
      :centerY="pieCenter.y"
      :context="pieContext"
      :highlightSwatch="ui.lastHighlightColor"
      :mode="pieMode"
      :area="pieArea"
      :onRegisterApi="pieController.registerMenuApi"
      :onUnregisterApi="pieController.unregisterMenuApi"
    />

    <PieColorMenu
      ref="colorPieRef"
      v-show="pieOpen && overlay.has('pie') && pieTop === 'color'"
      :open="pieOpen && overlay.has('pie') && pieTop === 'color'"
      :onRegisterApi="pieController.registerMenuApi"
      :onUnregisterApi="pieController.unregisterMenuApi"
      :x="pieAnchorX"
      :y="pieAnchorY"
      :centerX="pieCenter.x"
      :centerY="pieCenter.y"
      :context="pieContext"
      :textTokens="TEXT_TOKENS"
      :bgTokens="BG_TOKENS"
      :currentText="currentText"
      :currentBg="currentBg"
      :labelForText="labelForText"
      :labelForBg="labelForBg"
      :letterStyleForText="letterStyleForText"
      :swatchStyleForBg="swatchStyleForBg"
    />
    <PieHighlightMenu
      ref="highlightPieRef"
      v-show="pieOpen && overlay.has('pie') && pieTop === 'highlight'"
      :open="pieOpen && overlay.has('pie') && pieTop === 'highlight'"
      :onRegisterApi="pieController.registerMenuApi"
      :onUnregisterApi="pieController.unregisterMenuApi"
      :x="pieAnchorX"
      :y="pieAnchorY"
      :centerX="pieCenter.x"
      :centerY="pieCenter.y"
      :context="pieContext"
      :colors="HIGHLIGHT_COLORS"
      :current="ui.lastHighlightColor"
    />
    <PieBlockTypeMenu
      ref="typePieRef"
      v-show="pieOpen && overlay.has('pie') && pieTop === 'changeType'"
      :open="pieOpen && overlay.has('pie') && pieTop === 'changeType'"
      :x="pieAnchorX"
      :y="pieAnchorY"
      :centerX="pieCenter.x"
      :centerY="pieCenter.y"
      :context="pieContext"
      :currentType="currentBlockType"
      :onRegisterApi="pieController.registerMenuApi"
      :onUnregisterApi="pieController.unregisterMenuApi"
    />
  </Teleport>
  <OverlayHost />
  <Teleport to="body">
    <div
      v-if="!isLoginRoute && showBackdrop"
      class="overlay-backdrop"
      data-pie-overlay="true"
      :style="{
        pointerEvents:
          overlay.top?.interactionScope === 'global' ? 'none' : 'auto',
      }"
      @pointerdown.capture="onBackdropPointerDown"
      @wheel.capture="onBackdropWheel"
      @touchmove.capture.prevent.stop
    />
  </Teleport>
</template>

<style scoped>
/*SIDEBAR HIGHLIGHT WHEN MOVE-TO ARMED*/
.sidebar.pie-move-armed {
  outline: 2px solid rgba(0, 0, 0, 0.12);
  background: rgba(255, 255, 255, 0.35);
}
.sidebar.pie-move-armed [data-page-id] {
  transition: background 0.08s ease;
}
.sidebar.pie-move-armed [data-page-id].pie-drop-hover {
  background: rgba(0, 0, 0, 0.06);
}

.test::after {
  background: blue;
}

.overlay-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1990; /* sotto i menu (2000), sopra l’app */
  background: transparent; /* oppure rgba(0,0,0,.08) se vuoi */
  pointer-events: auto;
}
/*.scroll-lock{
    pointer-events: none;
  }*/
.shell {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-main); /*#fff*/
  color: var(--text-main); /*#111*/
  overflow: hidden;
}

.layout {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  overflow: hidden;
  position: relative;
}

/* docked sidebar wrapper */
.sidebar-docked {
  position: relative;
  flex: 0 0 auto;
  min-width: 0;
  height: 100vh;
  overflow: hidden;
}

/* resize handle: zona più larga per prenderla bene col mouse */
.sidebar-resize-handle {
  position: absolute;
  top: 0;
  right: -6px;
  width: 12px;
  height: 100%;
  cursor: col-resize;
  touch-action: none;
  z-index: 5;
}

/* feedback visivo discreto (linea centrale) */
.sidebar-resize-handle::after {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 1px;
  transform: translateX(-0.5px);
  background: rgba(0, 0, 0, 0.08);
  opacity: 0;
}

/* mostra un po’ la linea su hover/drag */
.sidebar-resize-handle:hover::after {
  opacity: 1;
}

:global(html) .sidebar-resize-handle:active::after {
  opacity: 1;
}

/* main content wrapper */
.content-area {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.content {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.content-scroll {
  height: 100%;
  overflow: auto;
  padding: 0px;
}

/* hit area invisibile per flyout */
.flyout-hit-area {
  position: absolute;
  top: 0;
  left: 0;
  width: 10px; /* puoi aumentare a 14px se vuoi più facile */
  height: 100%;
  z-index: 20;
}

.app-topbar {
  transition:
    transform 600ms ease,
    opacity 600ms ease;
  will-change: transform, opacity;
}

.app-topbar.hidden {
  transform: translateY(-110%);
  opacity: 0;
  pointer-events: none;
}

/* inputs/buttons  */
.input {
  height: 34px;
  padding: 0 10px;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.14);
  background: #fff;
  outline: none;
}
.input:focus {
  border-color: rgba(0, 0, 0, 0.28);
}

.btn {
  height: 34px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.14);
  background: rgba(0, 0, 0, 0.04);
  cursor: pointer;
}
.btn:hover {
  background: rgba(0, 0, 0, 0.07);
}
.btn.primary {
  background: rgba(0, 0, 0, 0.12);
}

.icon-btn {
  height: 34px;
  width: 34px;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.14);
  background: rgba(0, 0, 0, 0.04);
  cursor: pointer;
}
.icon-btn:hover {
  background: rgba(0, 0, 0, 0.07);
}

.error {
  margin: 0 0 12px;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(255, 0, 0, 0.08);
  font-size: 13px;
}
</style>
