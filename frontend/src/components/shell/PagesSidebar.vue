<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import router from "@/router";
import { storeToRefs } from "pinia";
import usePagesStore from "@/stores/pages";
import PageRowC from "@/components/PageRowC.vue";
import RecursiveDraggableV0 from "@/components/nested/RecursiveDraggableV0.vue";
import useAuthStore from "@/stores/auth";
import SidebarHeader from "@/components/shell/SidebarHeader.vue";
import PageActionsController from "@/components/PageActionsController.vue";
import PageTitlePopoverController from "@/components/PageTitlePopoverController.vue";
import { useOverlayStore } from "@/stores/overlay";
import { useUiStore } from "@/stores/ui";

import { useAppActions } from "@/actions/useAppActions";

import DndController from "@/components/draggableList/DndController.vue";

const ui = useUiStore();
const authStore = useAuthStore();
const overlay = useOverlayStore();
const displayName = computed(() => {
  // adatta a come salvi l’utente nello store
  // esempi comuni: authStore.user.name / authStore.user.username / authStore.me
  return authStore?.user?.name || authStore?.user?.username || "User";
});

const props = defineProps({
  variant: { type: String, default: "docked" }, // 'docked' | 'flyout'
  indentPx: { type: Number, default: 24 },
});

const actions = useAppActions();
const pagesStore = usePagesStore();
const { editingPageId } = storeToRefs(pagesStore);
const { draftPage } = storeToRefs(pagesStore);
const { SidebarMoveToArmed, pendingSidebarScrollToPageId } = storeToRefs(ui);

const rows = computed(() => pagesStore.renderRowsPages);

let scrollTimer = null;

function setScrollingOn(el) {
  if (!el) return;
  el.classList.add("is-scrolling");
  if (scrollTimer) clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => {
    el.classList.remove("is-scrolling");
  }, 450);
}

// ======== Actions passed-through ========

const deletePage = async (pageId) => {
  try {
    if (editingPageId.value === pageId) cancelEditTitle();

    const isDeletingOpenPage =
      router.currentRoute.value.name === "pageDetail" &&
      String(router.currentRoute.value.params.id) === String(pageId);

    let nextId = null;
    if (isDeletingOpenPage) {
      const idx = rows.value.findIndex(
        (row) => String(row.page.id) === String(pageId),
      );
      if (idx !== -1) {
        if (idx + 1 < rows.value.length) nextId = rows.value[idx + 1].page.id;
        else if (idx - 1 >= 0) nextId = rows.value[idx - 1].page.id;
      }
    }

    await actions.pages.deletePage(pageId);

    if (isDeletingOpenPage) {
      if (nextId != null) openPage(nextId);
      else router.push("/");
    }
  } catch {
    // gestisci in alto se vuoi
  }
};

async function createNewPage(parentId = null) {
  actions.pages.createChildAndActivate(parentId);
}

// ======== Context menu anchor management ========
const rootEl = ref(null);

// ======== Drag & Drop  ========
const KEY_ROOT = "root";
const parentKeyOf = (parentId) =>
  parentId == null ? KEY_ROOT : String(parentId);

// Expose per AppShell (resize / click-outside)
function containsTarget(t) {
  const el = rootEl.value;
  return !!(el && t && el.contains(t));
}

defineExpose({
  //updateMenuRectIfOpen,
  containsTarget,
});

const overlayTopId = computed(() => (overlay.hasAny ? overlay.top?.id : null));

const { childrenByParentId, pagesById, expandedById } = storeToRefs(pagesStore);

const sourceTree = computed(() => {
  if (!childrenByParentId.value || !pagesById.value) return [];
  return buildForest(
    childrenByParentId.value,
    pagesById.value,
    expandedById.value,
  );
});

const localTree = ref([]);

watch(
  sourceTree,
  (newVal) => {
    localTree.value = newVal;
  },
  { immediate: true },
);

//===FAVORITE LIST FLAT===
const favoritesTreeFlat = computed(() => {
  const byId = pagesById.value;
  if (!byId) return [];

  return Object.values(byId)
    .filter((p) => !!p?.favorite)
    .sort((a, b) => {
      const ap = a.favorite_position ?? "\uffff";
      const bp = b.favorite_position ?? "\uffff";
      if (ap < bp) return -1;
      if (ap > bp) return 1;
      return String(a.id).localeCompare(String(b.id));
    })
    .map((p) => ({
      ...p,
      children: [],
      hasChildren: false,
      isExpanded: false,
    }));
});

const hasFavoritePages = computed(() => {
  return pagesStore.hasFavoritePages();
});

const handleMoveFavorite = async ({ id, position }) => {
  // optimistic

  try {
    await actions.pages.updateFavoritePositionWithUndo(id, position);
  } catch (e) {
    console.error(e);
    // fallback hard:
    // await pagesStore.fetchPages()
  }
};

function buildForest(childrenMap, contentMap, expandedMap) {
  const rootIds = childrenMap[KEY_ROOT] ?? [];

  function buildNode(id) {
    //const pageData = contentMap[id];
    const key = String(id);
    const pageData = contentMap[id];
    if (!pageData) return null;

    const allChildIds = childrenMap[id] ?? [];
    const hasChildren = allChildIds.length > 0;
    let isExpanded = !!expandedMap[id];

    const visibleChildren = isExpanded
      ? allChildIds.map((childId) => buildNode(childId)).filter(Boolean)
      : [];

    return {
      ...pageData,
      hasChildren,
      isExpanded,
      children: visibleChildren,
    };
  }

  return rootIds.map((rootId) => buildNode(rootId)).filter(Boolean);
}

const handleToggleExpand = (pageId) => {
  actions.pages.toggleExpandPage(pageId);
  console.log(pagesStore.isExpanded(pageId));
};

const handleMove = async ({ id, parentId, position }) => {
  flashMoved(id);
  console.log(
    "Evento ricevuto dal generico:",
    "id:",
    id,
    "parent:",
    parentId,
    "pos:",
    position,
  );

  if (pagesStore.isCircularMove(id, parentId, pagesStore.pagesById)) {
    console.warn("Operazione bloccata: tentativo di creare un ciclo infinito.");
    localTree.value = buildForest(
      pagesStore.childrenByParentId,
      pagesStore.pagesById,
      pagesStore.expandedById,
    );
    return;
  }
  try {
    await actions.pages.movePageWithUndo({
      pageId: id,
      newParentId: parentId,
      newPosition: String(position),
    });
    actions.pages.ensureVisible(id);
  } catch (e) {
    console.error(e);
    //await pagesStore.fetchPages()
  }
};

//======= SIDEBAR EFFECTS ========

const sidebarScrollEl = ref(null);

const recentlyMovedId = ref(null);
let movedTimer = null;

function flashMoved(id) {
  recentlyMovedId.value = id;

  requestAnimationFrame(() => {
    const el = sidebarScrollEl.value?.querySelector?.(
      `.draggable-item[data-id="${id}"]`,
    );
    el?.scrollIntoView?.({ block: "nearest" });
  });

  if (movedTimer) clearTimeout(movedTimer);
  movedTimer = setTimeout(() => {
    recentlyMovedId.value = null;
  }, 900);
}

onUnmounted(() => {
  if (movedTimer) clearTimeout(movedTimer);
});
watch(pendingSidebarScrollToPageId, async (pageId) => {
  if (!pageId) return;

  // aspetta che la lista si aggiorni e il DOM esista
  await nextTick();
  requestAnimationFrame(() => {
    const el = sidebarScrollEl.value?.querySelector(
      `[data-page-id="${pageId}"]`,
    );
    if (!el) return;
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    ui.consumeScrollToPageRequest(pageId);
  });
});
</script>

<template>
  <aside
    ref="rootEl"
    class="sidebar"
    :class="[{ flyout: variant === 'flyout' }, { 'menu-open': false }]"
  >
    <div class="sidebar-header-pad">
      <SidebarHeader
        :displayName="displayName"
        @new-page="createNewPage"
        @logout="$emit('logout')"
      />

      <div v-if="hasFavoritePages" class="sidebar-title">Favorites</div>
    </div>

    <div v-show="hasFavoritePages" class="favorites-zone">
      <DndController
        :tree="favoritesTreeFlat"
        position-key="favorite_position"
        :allow-inside="false"
        @node-moved="handleMoveFavorite"
      >
        <template #row="{ item }">
          <PageRowC
            :page="item"
            :level="0"
            :has-children="false"
            :is-expanded="false"
            :is-active="pagesStore.currentPageId === item.id"
            :parent-key="'favorites'"
            :page-action-menu-id="overlayTopId"
            :anchor-scope="'favorites'"
            :data-anchor-scope="'favorites'"
            @add-child="createNewPage(item.id)"
          />
        </template>
      </DndController>
    </div>
    <div class="sidebar-header-pad">
      <div class="sidebar-title">All Pages</div>
    </div>
    <div ref="sidebarScrollEl" class="sidebar-scroll scrollbar-auto">
      <div class="all-pages-zone" :class="{ 'move-armed': SidebarMoveToArmed }">
        <!-- overlay SOLO qui -->
        <div
          v-if="SidebarMoveToArmed"
          class="all-pages-overlay"
          aria-hidden="true"
        />

        <DndController :tree="localTree" :indent="20" @node-moved="handleMove">
          <template #row="{ item, level, hasChildren, isExpanded }">
            <PageRowC
              :page="item"
              :level="level"
              :data-page-id="item.id"
              :has-children="hasChildren"
              :is-active="pagesStore.currentPageId === item.id"
              :is-expanded="isExpanded"
              :parent-key="pagesStore.getParentKey(item.parentId)"
              :page-action-menu-id="overlayTopId"
              :flash="String(recentlyMovedId) === String(item.id)"
              :anchor-scope="'tree'"
              :data-anchor-scope="'tree'"
              @toggle-expand="handleToggleExpand"
              @add-child="createNewPage(item.id)"
            />
          </template>
        </DndController>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.all-pages-zone {
  position: relative;
}

/* overlay “highlight” */
.all-pages-overlay {
  pointer-events: none;
  position: absolute;
  inset: 0;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.03);
  outline: 2px solid rgba(0, 0, 0, 0.08);
  pointer-events: none; /* ✅ non blocca interazioni */
  z-index: 2;
}

/* assicurati che la lista stia sopra/sotto come vuoi */
.all-pages-zone :deep(.dnd-root),
.all-pages-zone :deep(.page-row),
.all-pages-zone :deep(.page-item) {
  position: relative;
  z-index: 3; /* sopra l’overlay */
}

:deep(li.page-item.drop-inside) {
  position: relative;
}
:deep(li.page-item.drop-inside::after) {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 8px;
  background: rgba(100, 150, 255, 0.08) !important;
  pointer-events: none;
  z-index: 1000;
}

:deep(.page-item.drop-before),
:deep(.block-item.drop-before) {
  margin-top: 10px;
}

:deep(.page-item.drop-after),
:deep(.block-item.drop-after) {
  margin-bottom: 10px;
}

:deep(li.page-item.drop-before),
:deep(li.page-item.drop-after) {
  position: relative;
}

:deep(li.page-item.drop-before::before) {
  content: "";
  position: absolute;
  left: 10px;
  right: 10px;
  top: -3px;
  height: 2px;
  background: rgba(100, 150, 255, 0.7);
  border-radius: 2px;
  pointer-events: none;
}

:deep(li.page-item.drop-after::after) {
  content: "";
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: -3px;
  height: 2px;
  background: rgba(100, 150, 255, 0.7);
  border-radius: 2px;
  pointer-events: none;
}
:deep(.page-item),
:deep(.block-item) {
  transition:
    transform 120ms ease,
    background-color 120ms ease,
    margin 120ms ease;
  will-change: transform, margin;
}

:deep(.drop-before::before),
:deep(.drop-after::after) {
  transform: scaleX(0.85);
  opacity: 0;
  transition:
    transform 120ms ease,
    opacity 120ms ease;
}

:deep(.drop-before.drop-before::before),
:deep(.drop-after.drop-after::after) {
  transform: scaleX(1);
  opacity: 1;
}

/* ===== Sidebar base ===== */

.sidebar {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  border-right: 1.5px solid var(--border-main);
}
.sidebar-header-pad {
  flex: 0 0 auto;
  padding: var(--bar-pad);
  padding-bottom: 0;
}

/* scroll container interno: comodo sia docked che flyout */
.sidebar-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: var(--bar-pad);
  padding-left: var(--sidebar-pad-left);
  /* padding-bottom: 80px;*/
  scroll-padding-bottom: 80px;
}

.favorites-zone {
  padding-left: var(--sidebar-pad-left);
  padding-right: var(--bar-pad);
}

.sidebar-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary);
  margin-bottom: 10px;
  margin-top: 12px;
}

.page-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.sidebar.menu-open {
  pointer-events: none;
}
.sidebar.menu-open :deep(.menu-anchor),
.sidebar.menu-open :deep(.menu) {
  pointer-events: auto;
}

.sidebar.flyout {
  background: #fff;
}
.sidebar.flyout {
  background: transparent;
  border-right: none;
}
.sidebar.flyout .sidebar-scroll {
  background: transparent;
}

:deep(.drag-chosen) {
  transform: scale(1.01);
}

:deep(.drag-dragging) {
  transform: scale(1.02);
}

:deep(.drag-ghost) {
  opacity: 0.65;
  transform: scale(0.98);
  border-radius: 10px;
}
:deep(.drop-inside::after) {
  opacity: 0;
  transition: opacity 120ms ease;
}

:deep(.drop-inside.drop-inside::after) {
  opacity: 1;
}
</style>
