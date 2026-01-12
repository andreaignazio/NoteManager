<script setup>
   import BlockEditor from '@/views/BlockEditor.vue';
   import { useBlocksStore } from '@/stores/blocks'
   import { nextTick, ref, onMounted,onUnmounted } from 'vue';

   const blocksStore = useBlocksStore()

   const props = defineProps({
    block: Object,
    pageId: String,
    level: Number,
    parentKey: String,
    registerMenuAnchor: Function,
   })

   const menuBtn = ref(null)
    onMounted(() => {
      if(menuBtn.value){ props.registerMenuAnchor?.(props.block.id, menuBtn.value)} 
    })

    onUnmounted(()=>{
      if(menuBtn.value){props.registerMenuAnchor?.(props.block.id, null)}
    })

   const emit = defineEmits(['open-menu'])

   function handleOpenMenu(e) {
    emit('open-menu', props.block.id)
   }

   async function handleInsertAfter() {
      const newId = await blocksStore.addNewBlock(
        props.pageId,
        { type: 'p', content: { text: '' } },
        props.block.id
      )
      await nextTick()
      blocksStore.requestFocus(newId, 0)
    }

const INDENT = 24    
</script>


<template>
  <div
    class="block-item"
    :data-id="block.id"
    :data-parent="parentKey"
    :style="{ marginLeft: `${level * INDENT}px` }"
  >
    <!-- GUTTER -->
    <div class="gutter">
      <button
        class="plus"
        type="button"
        title="Add block"
        @click.stop="handleInsertAfter"
      >
      +
      </button>

      <button
        class="drag-handle"
        type="button"
        title="Drag"
        @click.stop
      >
        ⋮⋮
      </button>
    </div>

    <!-- CONTENT ROW -->
    <div class="row">
      <div class="blockContent">
        <BlockEditor :block="block" :pageId="pageId" />
      </div>

      <div class="blockActions">
        <button
          ref="menuBtn"
          class="dots"
          type="button"
          @click.stop="handleOpenMenu"
        >
          ⋯
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.block-item {
  display: grid;
  grid-template-columns: var(--block-gutter) 1fr;
  gap: var(--block-gap);
  align-items: stretch;
  padding: 0; /* IMPORTANT: nessun padding qui */
}

/* GUTTER */
.gutter {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

/* ROW (hover area) */
.row {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: stretch;
  gap: 6px;

  padding: 0px 0 0 var(--block-row-pad-x)  ;
  padding-top: 0px;
  padding-bottom: 4px;
  
  border-radius: 10px;
}

/* hover SOLO sul contenuto */
.block-item:hover .row {
  background: rgba(0, 0, 0, 0.03);
}

/* Handle + plus: solo su hover */
.drag-handle,
.plus {
  opacity: 0;
  pointer-events: none;
  transition: opacity 120ms ease, background-color 120ms ease;
}

.block-item:hover .drag-handle,
.block-item:hover .plus {
  opacity: 1;
  pointer-events: auto;
}

/* PLUS — quadrato su hover */
.plus {
  width: 20px;
  height: 20px;
  border-radius: 6px; /* quadrato morbido */
  border: 0;
  background: transparent;
  cursor: pointer;
  display: grid;
  place-items: center;
  
  align-items: center;
  justify-items: center;
  color: rgba(0,0,0,.35);
  font-size: 14px;
}

.plus:hover {
  background: rgba(0,0,0,.08);
  color: rgba(0,0,0,.65);
}

/* DRAG HANDLE */
.drag-handle {
  width: 18px;
  height: 18px;
  border-radius: 6px;
  border: 0;
  background: transparent;
  cursor: grab;
  display: grid;
  place-items: center;
  color: rgba(0,0,0,.35);
  font-size: 12px;
}

.drag-handle:hover {
  /*background: rgba(0,0,0,.08);*/
  background: rgba(0,0,0,.00);
  color: rgba(0,0,0,.65);
}

.drag-handle:active {
  cursor: grabbing;
}

/* Contenuto */
.blockContent {
  min-width: 0;
}

/* Actions */
.blockActions {
  display: flex;
  align-items: start;
}

/* Dots */
.dots {
  opacity: 0;
  pointer-events: none;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.block-item:hover .dots,
.block-item:focus-within .dots {
  opacity: 1;
  pointer-events: auto;
}
</style> 