<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref,watch } from 'vue'
import router from '@/router'
import { storeToRefs } from 'pinia'
import usePagesStore from '@/stores/pages'
import PageRowC from '@/components/PageRowC.vue'
import RecursiveDraggableV0 from '@/components/nested/RecursiveDraggableV0.vue';
import useAuthStore from '@/stores/auth'
import SidebarHeader from '@/components/shell/SidebarHeader.vue'
import PageActionsController from '@/components/PageActionsController.vue'
import PageTitlePopoverController from '@/components/PageTitlePopoverController.vue'
import { useOverlayStore } from '@/stores/overlay'

import DndController from '@/components/draggableList/DnDController.vue'

const authStore = useAuthStore()
const overlay = useOverlayStore()
const displayName = computed(() => {
  // adatta a come salvi l’utente nello store
  // esempi comuni: authStore.user.name / authStore.user.username / authStore.me
  return authStore?.user?.name || authStore?.user?.username || 'User'
})

const props = defineProps({
  variant: { type: String, default: 'docked' }, // 'docked' | 'flyout'
  indentPx: { type: Number, default: 24 },
})


const pagesStore = usePagesStore()
const { editingPageId } = storeToRefs(pagesStore)
const { draftPage } = storeToRefs(pagesStore)

const rows = computed(() => pagesStore.renderRowsPages)

let scrollTimer = null

function setScrollingOn(el) {
  if (!el) return
  el.classList.add('is-scrolling')
  if (scrollTimer) clearTimeout(scrollTimer)
  scrollTimer = setTimeout(() => {
    el.classList.remove('is-scrolling')
  }, 450)
}



// ======== Actions passed-through ========
const openPage = async (pageId) => {
  if (!pagesStore.pagesById[pageId]) {
    router.push('/')
    return
  }
  router.push({ name: 'pageDetail', params: { id: pageId } })
}

const deletePage = async (pageId) => {
  try {
    if (editingPageId.value === pageId) cancelEditTitle()

    const isDeletingOpenPage =
      router.currentRoute.value.name === 'pageDetail' &&
      String(router.currentRoute.value.params.id) === String(pageId)

    let nextId = null
    if (isDeletingOpenPage) {
      const idx = rows.value.findIndex((row) => String(row.page.id) === String(pageId))
      if (idx !== -1) {
        if (idx + 1 < rows.value.length) nextId = rows.value[idx + 1].page.id
        else if (idx - 1 >= 0) nextId = rows.value[idx - 1].page.id
      }
    }

    await pagesStore.deletePage(pageId)

    if (isDeletingOpenPage) {
      if (nextId != null) openPage(nextId)
      else router.push('/')
    }
  } catch {
    // gestisci in alto se vuoi
  }
}

const startEditTitle = async (pageId) => {
  pagesStore.startEdit(pageId)
  await nextTick()
}

const cancelEditTitle = () => {
  pagesStore.cancelEdit()
}

const commitEditTitle = async (pageId) => {
  await pagesStore.commitEdit(pageId)
}

async function addChildAndRename(parentId) {
  if (!pagesStore.expandedById[parentId]) pagesStore.expandPage(parentId)
  const child = await pagesStore.addChildPage(parentId, { title: '' })
  startEditTitle(child)
}

const toggleExpandPage = async (pageId) => {
  await pagesStore.toggleExpandPage(pageId)
}

async function createNewRootPage() {
  // crea una nuova pagina a root e entra in rename
  const id = await pagesStore.addChildPage(null, { title: '' })
  await nextTick()
  startEditTitle(id)
}


// ======== Context menu anchor management ========
const rootEl = ref(null)
const sidebarScrollEl = ref(null)


const menuAnchorByPageId = new Map()

const registerMenuAnchor = (pageId, el) => {
  if (!pageId) return
  if (el) menuAnchorByPageId.set(String(pageId), el)
  else menuAnchorByPageId.delete(String(pageId))
}

const pageActionsRef = ref(null)
const pageTitlePopoverRef = ref(null)

const actionsPageId = ref(null)   // string|number|null
const actionsAnchorEl = ref(null) // HTMLElement|null

const isActionsOpen = computed(() => actionsPageId.value != null)

function openPageActions(pageId) {
  const el = menuAnchorByPageId.get(String(pageId))
  if (!el) return

  actionsPageId.value = pageId
  actionsAnchorEl.value = el
  console.log("Anhor:", actionsAnchorEl.value, "pageId:", pageId)
  nextTick(() => {
    pageActionsRef.value?.open?.()
  })
}

function closePageActions() {
  pageActionsRef.value?.close?.()
  actionsPageId.value = null
  actionsAnchorEl.value = null
}

function onRenameFromMenu(){
  pageTitlePopoverRef.value?.open?.()
}

function onSidebarScroll() {
  //updateMenuRectIfOpen()
  setScrollingOn(sidebarScrollEl.value)
}

// ======== Drag & Drop  ========
const KEY_ROOT = 'root'
const parentKeyOf = (parentId) => (parentId == null ? KEY_ROOT : String(parentId))

// Expose per AppShell (resize / click-outside)
function containsTarget(t) {
  const el = rootEl.value
  return !!(el && t && el.contains(t))
}

defineExpose({
  //updateMenuRectIfOpen,
  containsTarget,
})


  const overlayTopId = computed(()=>overlay.hasAny ? overlay.top?.id : null )

  const { childrenByParentId, pagesById, expandedById } = storeToRefs(pagesStore);
  

  const sourceTree = computed(() => {
      if (!childrenByParentId.value || !pagesById.value) return [];
      return buildForest(
        childrenByParentId.value, 
        pagesById.value, 
        expandedById.value 
    );
  });

  const localTree = ref([]);

  watch(sourceTree, (newVal) => {
      localTree.value = newVal;
  }, { immediate: true});

  function buildForest(childrenMap, contentMap, expandedMap) {
        const rootIds = childrenMap[KEY_ROOT] ?? [];

      function buildNode(id) {
          //const pageData = contentMap[id];
          const key = String(id)
          const pageData = contentMap[id]
          if (!pageData) return null;

          const allChildIds = childrenMap[id] ?? [];
          const hasChildren = allChildIds.length > 0;
          let isExpanded = !!expandedMap[id];
          console.log(id,isExpanded)

          const visibleChildren = isExpanded 
              ? allChildIds.map(childId => buildNode(childId)).filter(Boolean)
              : [];

              console.log('id', id, 'children keys has?', Object.prototype.hasOwnProperty.call(childrenMap, String(id)), 'raw', childrenMap[String(id)])

              console.log("built_new_tree")
          return {
              ...pageData,
              hasChildren, 
              isExpanded, 
              children: visibleChildren 
          }
      }

      return rootIds.map(rootId => buildNode(rootId)).filter(Boolean);
  }

 

  

   const handleToggleExpand = (pageId) => {
    pagesStore.toggleExpandPage(pageId);
    console.log(pagesStore.isExpanded(pageId))
  }
 

  const handleMove = async ({ id, parentId, position }) => {
    flashMoved(id)
    console.log("Evento ricevuto dal generico:", "id:",id, "parent:",parentId, "pos:",position);
    
    if (pagesStore.isCircularMove(id, parentId, pagesStore.pagesById)) {
          console.warn("Operazione bloccata: tentativo di creare un ciclo infinito.");
          localTree.value = buildForest(pagesStore.childrenByParentId, pagesStore.pagesById,pagesStore.expandedById );
          return; 
      }
      pagesStore.updatePageLocationOptimistic(id, { 
        newParentId: parentId, 
        newPosition: position 
    });
      pagesStore.ensureVisible(id)
    try {
       const res = await pagesStore.patchPage(String(id), { parent: parentId, position:String(position) });
       console.log("MovedID:",res.data.id, "MovedParentID", res.data.parent)
    } catch (e) {
        console.error(e);
        //await pagesStore.fetchPages()
    }
    
  };
function test() {
  console.log(tree.value)
}
function startEdit(){}

const recentlyMovedId = ref(null)
let movedTimer = null

function flashMoved(id) {
  recentlyMovedId.value = id

  requestAnimationFrame(() => {
    const el = sidebarScrollEl.value?.querySelector?.(`.draggable-item[data-id="${id}"]`)
    el?.scrollIntoView?.({ block: 'nearest' })
  })


  if (movedTimer) clearTimeout(movedTimer)
  movedTimer = setTimeout(() => {
    recentlyMovedId.value = null
  }, 900)
}

onUnmounted(() => {
  if (movedTimer) clearTimeout(movedTimer)
})

onMounted(pagesStore.fetchPages);

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
        @new-page="createNewRootPage"
        @logout="$emit('logout')"
      />
      
      <div class="sidebar-title">Pages</div>
      </div>
    <div ref="sidebarScrollEl" class="sidebar-scroll scrollbar-auto">
      
      <!--<NestedList/>-->
      <!--<DndController
        :tree="localTree"
        @node-moved="handleMove"
      />-->
      <DndController
        :tree="localTree"
        @node-moved="handleMove"
      >
        <template #row="{ item, level, hasChildren, isExpanded }">
          <PageRowC
            :page="item"
            :level="level"
            :has-children="hasChildren"
            :is-active="pagesStore.currentPageId === item.id"
            :is-expanded="isExpanded"
            :is-editing="String(editingPageId) === item.id"
            :draft-title="draftPage.title"
            :register-menu-anchor="registerMenuAnchor"
            :parent-key="pagesStore.getParentKey(item.parentId)"
            :page-action-menu-id="overlayTopId"
            :flash="String(recentlyMovedId) === String(item.id)"
            @open="openPage"
            @start-edit="startEdit"
            @toggle-expand="handleToggleExpand"
            @add-child="addChildAndRename"
            @open-menu="openPageActions"
            @update:draftTitle="draftPage.title = $event"
            @commit="commitEditTitle"
            @cancel="cancelEditTitle"
          />
        </template>
      </DndController>

      <!--<RecursiveDraggableV0 vif="childrenByParentId"
          v-model:list="localTree"
          parent-id="root" 
          root-key="root"
          @node-moved="handleMove"
      >
          <template #row="{ element, level }">
             <PageRowNS 
                :row = "{page: element, level: level}"
                :indentPx="indentPx"
                :isActive="element.id === pagesStore.currentPageId"
                :isEditing="String(editingPageId) === String(element.id)"
                :draftTitle="draftPage.title"
                :hasChildren="pagesStore.hasChildren(element.id)"
                :isExpanded="pagesStore.isExpanded(element.id)"
                :registerMenuAnchor="registerMenuAnchor"
                :pagesMenu="pagesStore.contextMenu"
                :parentKey="pagesStore.getParentKey(element.parentId)"
                :pageActionMenuId="overlayTopId"
                 @update:draftTitle="draftPage.title = $event"
                @open="openPage"
                @add-child="addChildAndRename"
                @toggle-expand="handleToggleExpand"
                @commit="commitEditTitle"
                @cancel="cancelEditTitle"
                @open-menu="openPageActions"

             />
             
          </template>
      </RecursiveDraggableV0>-->
      <PageActionsController
        ref="pageActionsRef"
        :pageId="actionsPageId"
        :anchorEl="actionsAnchorEl"
        placement="right"
        :lockScrollOnOpen="true"
        anchorLocation="sidebar" 
        @rename="onRenameFromMenu"
        @deleted="() => {}"
        @duplicated="(newId) => openPage(newId)"   
        @moved="() => {}"
        @close="() => {}"
      />
      <PageTitlePopoverController
      ref="pageTitlePopoverRef"
      :pageId="actionsPageId"
      :anchorEl="actionsAnchorEl"
      :lockScrollOnOpen="true" 
      anchorLocation="sidebar" 
      
      />
    </div>
  </aside>
</template>

<style scoped>


:deep(li.page-item.drop-inside) { position: relative; }
:deep(li.page-item.drop-inside::after) {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 8px;
  background: rgba(100, 150, 255, 0.08) !important;
  pointer-events: none;
  z-index: 1000;
}


:deep(.page-item.drop-before),
:deep(.block-item.drop-before) { margin-top: 10px; }

:deep(.page-item.drop-after),
:deep(.block-item.drop-after) { margin-bottom: 10px; }

:deep(li.page-item.drop-before),
:deep(li.page-item.drop-after) { position: relative; }

:deep(li.page-item.drop-before::before) {
  content:'';
  position:absolute;
  left: 10px; right: 10px;
  top: -3px;
  height: 2px;
  background: rgba(100,150,255,.7);
  border-radius: 2px;
  pointer-events:none;
}

:deep(li.page-item.drop-after::after) {
  content:'';
  position:absolute;
  left: 10px; right: 10px;
  bottom: -3px;
  height: 2px;
  background: rgba(100,150,255,.7);
  border-radius: 2px;
  pointer-events:none;
}
:deep(.page-item),
:deep(.block-item) {
  transition: transform 120ms ease, background-color 120ms ease, margin 120ms ease;
  will-change: transform, margin;
}

:deep(.drop-before::before),
:deep(.drop-after::after) {
  transform: scaleX(0.85);
  opacity: 0.0;
  transition: transform 120ms ease, opacity 120ms ease;
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
  background: rgba(0,0,0,.03);
  border-right: 1px solid rgba(0,0,0,.08);
  
}
.sidebar-header-pad{
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
}

.sidebar-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: rgba(0,0,0,.6);
  margin-bottom: 10px;
  margin-top: 12px;
}


.page-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}



.sidebar.menu-open { pointer-events: none; }
.sidebar.menu-open :deep(.menu-anchor),
.sidebar.menu-open :deep(.menu) { pointer-events: auto; }


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