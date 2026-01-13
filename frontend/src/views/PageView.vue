<script setup>
  import { compile, computed, nextTick, ref, watch, onMounted, onUnmounted, onBeforeUnmount } from 'vue'
  
  import usePagesStore from '@/stores/pages'
  import { useBlocksStore } from '@/stores/blocks'
  import RecursiveDraggableV0 from '@/components/nested/RecursiveDraggableV0.vue';
  import BlockRow from '@/views/BlockRow.vue'
  //import BlockTypeMenu from '@/views/BlockTypeMenu.vue'
  import { storeToRefs } from 'pinia'
  import Sortable from 'sortablejs'
  //import ActionMenu from '@/components/ActionMenu.vue'
  import { BLOCK_TYPES } from '@/domain/blockTypes'
  import useScrollLock from '@/composables/useScrollLock'
  import BlockTypeMenuController from '@/components/BlockTypeMenuController.vue'
  const { lock, unlock } = useScrollLock()
  import { useOverlayStore } from '@/stores/overlay'


  const pagesStore = usePagesStore()
  const blocksStore = useBlocksStore()
  
  const {currentPageId} = storeToRefs(pagesStore)

  const {optionsMenu} = storeToRefs(blocksStore)
  const overlay = useOverlayStore()
  
  const props = defineProps({
    id: String
  })

 
  /*const rows = computed( ()=>
    blocksStore.renderRowsForPage(props.id)
  )*/

  const menuItems = computed(() => ([
      ...BLOCK_TYPES.map(t => ({
        type: 'item',
        id: `type:${t.type}`,
        label: t.label,
        icon: t.icon,
        payload: { type: t.type },
      })),
      { type: 'separator' },
      {
        type: 'item',
        id: 'delete',
        label: 'Delete block',
        icon: '🗑️',
        danger: true,
        payload: { blockId: optionsMenu.value.blockId },
      }
  ]))

function onMenuAction({ id, payload }) {
  if (id.startsWith('type:')) {
    blocksStore.updateBlockType(optionsMenu.value.blockId, payload.type)
    return
  }
  if (id === 'delete') {
    console.log("PROPS:", props.id)
    blocksStore.deleteBlock(payload.blockId, props.id)
    return
  }
  // futuro: altre azioni qui senza creare nuovi eventi
}

const optionsMenuActiveId = computed(() => {
  const blockId = optionsMenu.value.blockId
  const block = blocksStore.blocksById[blockId]
  return block ? block.type : null
})


  const menuAnchorByBlockId = new Map() //Ogni row registra qui il DOM che apre il menu
  
  const layoutTick = ref(0)
  const bumpLayoutTick = () => { layoutTick.value++ }

  onMounted(() => window.addEventListener('resize', bumpLayoutTick))
  onBeforeUnmount(() => window.removeEventListener('resize', bumpLayoutTick))

  /*const anchorRectLive = computed(() => {
    layoutTick.value
    if (!optionsMenu.value.open) return null
    const blockId = optionsMenu.value.blockId
    const el = menuAnchorByBlockId.get(String(blockId))
    //console.log(el)
    if (!el) return null

    const r = el.getBoundingClientRect()
    return {
      top: r.top,
      left: r.left,
      right: r.right,
      bottom: r.bottom,
      width: r.width,
      height: r.height,
    }
  })*/

  const registerMenuAnchor = (blockId, el) => {
    if (!blockId) return
    if (el) menuAnchorByBlockId.set(String(blockId), el)
    else menuAnchorByBlockId.delete(String(blockId))
  }

  /*function onOpenBlockMenu(blockId) {
  const el = menuAnchorByBlockId.get(String(blockId))
  if (!el) return

  lock() 
  blocksStore.openOptionsMenu(blockId)
  }*/


watch(() => optionsMenu.value.open,
  (open) => {
    if (!open) unlock()
  })

  
const blockMenuRef = ref(null)
const blockMenuAnchorEl = ref(null) // HTMLElement
const blockMenuBlockId = ref(null)

function onOpenBlockMenu(blockId) {
  const el = menuAnchorByBlockId.get(String(blockId))
  if (!el) return
  blockMenuAnchorEl.value = el
  blockMenuBlockId.value = blockId
  nextTick(() => blockMenuRef.value?.open?.())
}

/*watch( anchorRectLive,
  (r) => {
    if (!optionsMenu.value.open || !r) return

    const margin = 8
    const out =
      r.bottom < margin ||
      r.top > window.innerHeight - margin ||
      r.right < margin ||
      r.left > window.innerWidth - margin

    if (out) {
      blocksStore.closeOptionsMenu()
    }
  })*/

  
  const errorMsg = ref("")
 
   

  watch(
  () => props.id,
  async (newId) => {
    await pagesStore.openPage(newId)
    await blocksStore.fetchBlocksForPage(newId)

    // focus sul primo blocco root
    const rootIds = blocksStore.childrenByParentId[newId]?.root
    const firstId = rootIds?.[0]
    if (firstId) {
      await nextTick()
      blocksStore.requestFocus(firstId, 0)
    }
  },
  { immediate: true }
)




  // --- Title inline editing ---
  const titleDraft = ref('')
  let titleTimer = null
  let titleOriginal = ''

  watch(
    () => pagesStore.pagesById[currentPageId.value]?.title,
    (t) => {
      titleDraft.value = t ?? ''
    },
    { immediate: true }
  )

  function onTitleFocus() {
    titleOriginal = titleDraft.value ?? ''
  }

  function onTitleInput(e) {
    titleDraft.value = e.target.value

    // debounce persist (opzionale ma “effortless”)
    if (titleTimer) clearTimeout(titleTimer)
    titleTimer = setTimeout(() => commitTitle(), 300)
  }

  async function commitTitle() {
    if (!currentPageId.value) return
    const nextTitle = (titleDraft.value ?? '').trim() || 'Untitled'
    if (pagesStore.pagesById[currentPageId.value]?.title === nextTitle) return

    // optimistic
    pagesStore.pagesById[currentPageId.value].title = nextTitle

    // persist: usa la tua funzione reale
    await pagesStore.patchPage(currentPageId.value, { title: nextTitle })
  }

  async function onTitleBlur() {
    if (titleTimer) clearTimeout(titleTimer)
    titleTimer = null
    await commitTitle()
  }

  async function onTitleKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.currentTarget.blur()
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      // revert
      titleDraft.value = titleOriginal
      e.currentTarget.blur()
    }
  }


//pageId = props.id
const { childrenByParentId, blocksById, expandedById } = storeToRefs(blocksStore);
const KEY_ROOT = 'root'
const sourceTree = computed(() => {
      if (!childrenByParentId.value?.[props.id] || !blocksById.value) return [];
      // ... la tua funzione buildForest rivista ...
      return buildForest(
        childrenByParentId.value[props.id], 
        blocksById.value, 
        expandedById.value // <--- Passiamo la mappa dello store
    );
  });

  const localTree = ref([]);

  watch(sourceTree, (newVal) => {
      localTree.value = newVal;
  }, { immediate: true, deep: true });

  function buildForest(childrenMap, contentMap, expandedMap) {
        const rootIds = childrenMap[KEY_ROOT] ?? [];

      function buildNode(id) {
          const pageData = contentMap[id];
          if (!pageData) return null;

          const allChildIds = childrenMap[id] ?? [];
          const hasChildren = allChildIds.length > 0;
          
          // CHECK ESPANSIONE:
          // Controlliamo se l'ID è true nella mappa dello store.
          // Usiamo !! per forzare un booleano (utile se è undefined)
          let isExpanded = !!expandedMap[id];
            isExpanded = true;  

          const visibleChildren = isExpanded 
              ? allChildIds.map(childId => buildNode(childId)).filter(Boolean)
              : [];

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
    // Chiamiamo l'azione dello store invece di modificare un ref locale
    pagesStore.toggleExpandPage(pageId);
  }
 
  const handleMove = async ({ id, parentId, position }) => {
    console.log("Evento ricevuto dal generico:", "id:",id, "parent:",parentId, "pos:",position);
    
    if (blocksStore.isCircularMove(id, parentId, blocksStore.blocksById)) {
          console.warn("Operazione bloccata: tentativo di creare un ciclo infinito.");
          localTree.value = buildForest(blocksStore.childrenByParentId[props.id], 
          blocksStore.blocksById,
          blocksStore.expandedById);
          return; 
      }

   try {
       await blocksStore.moveBlock(props.id, id, { parentId, position })
    } catch (e) {
        console.error(e);
        //await pagesStore.fetchPages()
    }

  };

const overlayTopId = computed(()=>overlay.hasAny ? overlay.top?.id : null )
</script>

<template>
  <div class="page">
    <div class="lane">
      <!-- TITLE -->
      <div class="title-row" v-if="currentPageId">
        <div class="gutter" aria-hidden="true"></div>

        <div class="content">
          <input
            ref="titleInputEl"
            class="page-title-input"
            :value="titleDraft"
            @focus="onTitleFocus"
            @blur="onTitleBlur"
            @keydown="onTitleKeydown"
            @input="onTitleInput"
            placeholder="Untitled"
          />
        </div>
      </div>

      <!-- BLOCKS -->
       <div ref="blockListEl" class="block-list">
       <RecursiveDraggableV0 v-if="childrenByParentId"
          v-model:list="localTree"
          parent-id="root" 
          root-key="root"
          @node-moved="handleMove"
      >
          <template #row="{ element, level }">
            <BlockRow
              :block="element"
              :level="level"
              :pageId="id"
              :parentKey="blocksStore.getParentKeyOf(element.parentId)"
              :registerMenuAnchor="registerMenuAnchor"
              :blockActionMenuId="overlayTopId"
              @open-menu="onOpenBlockMenu"
            />
          </template>
      </RecursiveDraggableV0>
    </div>
    </div>

    <!-- Action menu -->
    <BlockTypeMenuController
  ref="blockMenuRef"
  :pageId="id"
  :blockId="blockMenuBlockId"
  :anchorEl="blockMenuAnchorEl"
  anchorLocation="blockRow"
  placement="left"
  :sideOffsetX="0"
  :lockScrollOnOpen="true"
/>
  </div>
</template>

<style scoped>


.page {
  max-width: 820px;
  margin: 0 auto;
  padding: 24px 16px 80px;
}

/* Lane condivisa (titolo + blocchi) */
.lane {
  display: grid;
  grid-template-columns: var(--block-gutter) 1fr;
  column-gap: var(--block-gap);
}

/* Titolo usa la stessa griglia */
.title-row {
  grid-column: 1 / -1;
  display: contents;
}

.title-row > .content {
  padding: 0 var(--block-row-pad-x);
  margin-bottom: 6px;
}

.page-title-input {
  width: 100%;
  border: none;
  outline: none;
  background: transparent;

  font-size: 52px;
  font-weight: 700;
  line-height: 2;

  padding: 2px 0; /* evita clipping */
}



/* Lista blocchi */
.block-list {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

:deep(.block-item .row) {
  position: relative;                 /* anchor per ::before/::after */
  transition: background-color 140ms ease, transform 140ms ease;
  will-change: background-color, transform;
}
:deep(.block-item:hover .row) {
  background: rgba(0, 0, 0, 0.03);
}

/* Base */
:deep(.block-item.drop-before),
:deep(.block-item.drop-after),
:deep(.block-item.drop-inside) {
  position: relative;
}

/* ============ INSIDE ============ */
:deep(.block-item.drop-inside .row)::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 10px;
  background: rgba(100, 150, 255, 0.08);
  pointer-events: none;

  opacity: 0;
  transform: scale(0.985);
  transition: opacity 120ms ease, transform 120ms ease;
  will-change: opacity, transform;
}

:deep(.block-item.drop-inside .row)::after {
  opacity: 1;
  transform: scale(1);
}

/* ============ BEFORE / AFTER LINE ============ */
:deep(.block-item.drop-before .row)::before,
:deep(.block-item.drop-after .row)::after {
  content: '';
  position: absolute;
  left: 2px;
  right: 2px;
  height: 2px;
  border-radius: 2px;
  pointer-events: none;

  background: rgba(100, 150, 255, 0.75);
  box-shadow: 0 0 0 1px rgba(100, 150, 255, 0.18); /* glow soft */

  opacity: 0;
  transform: scaleX(0.96);
  transition: opacity 120ms ease, transform 120ms ease;
  will-change: opacity, transform;
}

:deep(.block-item.drop-before .row)::before {
  top: -4px;
  opacity: 1;
  transform: scaleX(1);
}

:deep(.block-item.drop-after .row)::after {
  bottom: -4px;
  opacity: 1;
  transform: scaleX(1);
}

:deep(.block-item.drop-inside .row),
:deep(.block-item.drop-before .row),
:deep(.block-item.drop-after .row) {
  transform: translateY(-1px);
}
</style>
