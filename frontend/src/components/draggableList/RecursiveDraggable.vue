<script setup>
import { ref, watch, onBeforeUnmount, nextTick } from 'vue'
import { useDraggable } from 'vue-draggable-plus'

defineOptions({ name: 'RecursiveDraggable' })
import { classForTextToken, classForBgToken } from '@/theme/colorsCatalog'

const props = defineProps({
  items: { type: Array, required: true },
  dndOptions: { type: Object, default: () => ({}) },
  level: { type: Number, default: 0 },
  indent: {type:Number, default: 0}
})

const listEl = ref(null)

const emit = defineEmits(['addChildToggle'])
function addChildToggle(element){
  emit(addChildToggle,element)
}


// in base alla versione, può essere un'istanza Sortable o una funzione cleanup
let instanceOrCleanup = null

watch(
  listEl,
  (el) => {
    if (!el) return
    if (instanceOrCleanup) return // evita doppia init

    // inizializza SOLO quando il DOM ref esiste
    instanceOrCleanup = useDraggable(listEl, props.items, {
      ...props.dndOptions,
      draggable: '.draggable-item',
    })
  },
  { flush: 'post', immediate: true }
)

onBeforeUnmount(() => {
  // alcune versioni ritornano una funzione cleanup
  if (typeof instanceOrCleanup === 'function') instanceOrCleanup()

  // altre ritornano un'istanza Sortable con destroy()
  else if (instanceOrCleanup?.destroy) instanceOrCleanup.destroy()
})

const bgScope = (el) =>{
  if(el.type === 'code') return 'code'
  else if(el.type === 'callout') return 'callout'
  else return 'subtree'
}

import { useBlocksStore } from '@/stores/blocks'
const blocksStore = useBlocksStore()

async function onCreateFirstToggleChild(toggleEl) {
  const toggleId = String(toggleEl.id)

  // assicura che sia aperto
  blocksStore.expandBlock(toggleId)
  const block = blocksStore.blocksById[toggleId]
  const newId = await blocksStore.addChildBlock(block.pageId, toggleId, {
    type: 'p',     // o 'p'
    content: { text: '' },
  })

  await nextTick()
  blocksStore.requestFocus(newId, 0)
}

</script>

<template>
  <div ref="listEl" class="list-level">
    <div
      v-for="element in items"
      :key="element.id"
      class="draggable-item"
      :data-id="element.id"
      :data-depth="level" 
      :class="{ 'has-bg': element.props?.style?.bgColor,
        'bg-code': bgScope(element) ==='code',
        'bg-callout' : bgScope(element) === 'callout',
        'bg-subtree' : bgScope(element) === 'subtree'
       }"
      :style="element.props
      ? { '--node-bg': `var(--${classForBgToken(element.props.style.bgColor)})` }
      : null "
    >
      <!-- ANCORAGGIO STABILE: la row esiste sempre -->
      <div class="row">
        <slot name="row" 
        :item="element" 
        :level="level" 
        :has-children="!!element.hasChildren" 
        :is-expanded="!!element.isExpanded">
        <span style="color:red">DEFAULT SLOT</span>
        <!--<span>{{ element.title }}</span>--> 
        </slot>
      </div>
      <div class="nested-zone"
      :style="{paddingLeft: indent + 'px'}">
      <div class="empty-wrapper">
        <button
          v-if="element.type === 'toggle' && (!element.children || element.children.length === 0) 
          && element.isExpanded"
          class="toggle-empty"
          
          @click.stop="onCreateFirstToggleChild(element)"
        >
          Empty toggle. Click or drop blocks inside.
    </button>
    </div>
      <!--<div v-if="element.isExpanded && element.children?.length" class="nested-zone">-->
        <RecursiveDraggable :items="element.children" :dnd-options="dndOptions" :level="level + 1">
          <template #row="slotProps">
            <slot name="row" v-bind="slotProps" />
          </template>
        </RecursiveDraggable>
      </div>
    </div>
  </div>
</template>

<style scoped>
  .empty-wrapper{
    padding-left: 70px;
  }
  .toggle-empty{
    display: block;
  width:  100%;
  max-width: 100%;
  padding-left: 70px;
  padding-right: 2000px;           /* o allinealo come preferisci */
  padding: 6px 10px;
  border-radius: 4px;
  opacity: .6;
  font-size: 13px;
  user-select: none;
  border:0;
  font-size: 13px;
  text-align: left;
  box-sizing: border-box;
  overflow: hidden;
  background:transparent;
  color: var(--text-secondary)
  
}
.toggle-empty:hover{
  background-color: var(--bg-hover);
}
.list-level { 
  position: relative;
 }
.nested-zone { 
  min-width: 0;
  padding-left:0px; }
.row {
  display: flex;
  gap: 8px;
  align-items: center;
  min-height: 0px;
  width: 100%;
  
}
.row > :deep(*) {
  flex: 1;
  min-width: 0;
  
}
.drag-handle { cursor: grab; user-select: none; }
.draggable-item {
  position: relative;
   border-radius: 2px;
   font-size: 14px;
    }



/* BASE: crea sempre il backdrop */
.draggable-item.has-bg::before {
  min-width: var(--block-row-min-width);
  content: "";
  position: absolute;
  top: 2px;
  bottom: 0;
  right: 0;
  background: var(--node-bg);
  pointer-events: none;
  z-index: 0;
  opacity: 0.5;
  border-radius: 3px;
  left: 48px; /* default: esclude gutter */
}

/* SUBTREE: se vuoi stesso comportamento del default, puoi anche ometterla */
.draggable-item.bg-subtree.has-bg::before {
  /* opzionale: solo override specifici */
}

/* CODE: magari vuoi un “card” più staccato */
.draggable-item.bg-code.has-bg::before {
  background: var(--bg-code);
  border-radius: 8px;
  opacity: 1; /* tipico per code */
  /* se vuoi che il code non copra tutta la nested-zone:
     applica lo scope a livello template (vedi sotto), oppure... */
}

/* Callout: più presente */
.draggable-item.bg-callout.has-bg::before {
  border-radius: 10px;
  opacity: 1;
  top: 6px;
 
}

</style>