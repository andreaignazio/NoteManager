<script setup>
import { ref, watch, onBeforeUnmount } from 'vue'
import { useDraggable } from 'vue-draggable-plus'

defineOptions({ name: 'RecursiveDraggable' })

const props = defineProps({
  items: { type: Array, required: true },
  dndOptions: { type: Object, default: () => ({}) },
  level: { type: Number, default: 0 },
})

const listEl = ref(null)

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
</script>

<template>
  <div ref="listEl" class="list-level">
    <div
      v-for="element in items"
      :key="element.id"
      class="draggable-item"
      :data-id="element.id"
      :data-depth="level" 
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
      <div class="nested-zone">
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
.list-level { position: relative; }
.nested-zone { padding-left: 20px; }
.row {
  display: flex;
  gap: 8px;
  align-items: center;
  min-height: 40px;
  width: 100%;
}
.row > :deep(*) {
  flex: 1;
  min-width: 0;
}
.drag-handle { cursor: grab; user-select: none; }
.draggable-item { font-size: 14px; }
</style>