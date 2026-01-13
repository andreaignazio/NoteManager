<script setup>
import { computed, ref } from 'vue';
import draggable from 'vuedraggable';
import { posBetween } from '@/domain/position'; 

defineOptions({ name: 'RecursiveDraggable' });

const props = defineProps({
  list: { type: Array, required: true },
  parentId: { type: [String, null], default: null },
  groupName: { type: String, default: 'generic-tree' }, // Nome gruppo dinamico
  rootKey: { type: String, default: 'root' }, // Configurazione per la root
  level: {type: Number, default: 0}
});

const emit = defineEmits(['update:list', 'node-moved']);

const localChildren = computed({
  get: () => props.list,
  set: (value) => emit('update:list', value)
});

// LOGICA GENERICA DI CALCOLO POSIZIONE
const onDragChange = (event) => {
  const context = event.moved || event.added;
  if (!context) return;

  const { element, newIndex } = context;
  
  // Gestione Root generica
  let targetParentId = props.parentId;
  if (targetParentId === props.rootKey) {
    targetParentId = null;
  }

  // Identificazione vicini (assumiamo che gli oggetti abbiano una prop .position)
  const siblings = localChildren.value;
  console.log("targetParentID:", targetParentId, "siblings:", localChildren.value)
  const prevItem = siblings[newIndex - 1];
  const nextItem = siblings[newIndex + 1];

  const prevPos = prevItem?.position || null;
  const nextPos = nextItem?.position || null;

  const newPosition = posBetween(prevPos, nextPos);

  // Emettiamo l'evento al componente Smart (NON chiamiamo lo store qui)
  emit('node-moved', {
    id: element.id,
    parentId: targetParentId,
    position: newPosition,
    element: element 
  });
};

// Funzione per inoltrare l'evento dai figli ricorsivi al padre (Bubbling manuale)
const handleChildMove = (payload) => {
  emit('node-moved', payload);
};

const isDragging = ref(false)

const onStart = () => { isDragging.value = true }
const onEnd = () => { isDragging.value = false }

</script>

<template>
  <div :class="{'is-dragging': isDragging}">
  <draggable
    v-model="localChildren"
    :group="groupName"
    item-key="id"
    ghost-class="ghost-card"
    drag-class="drag-card"
    handle=".drag-handle"
    swapThreshold="1"
    :animation="200"
    @change="onDragChange"
  >
    <template #item="{ element }">
      <div class="draggable-item">
        
        <slot name="row" :element="element" :level="level"
        :class="{'is-dragging': isDragging}"
        ></slot>

        <div class="nested-zone" :class="{ 'is-empty': (element.children?.length ?? 0) === 0 }">
          <RecursiveDraggable
            v-model:list="element.children"
            :parent-id="element.id"
            :group-name="groupName"
            :root-key="rootKey"
            :level="level+1"
            @node-moved="handleChildMove"
          >
            <template #row="{ element: childElement, level: childLevel }">
               <slot name="row" :element="childElement" :level="childLevel"
               :class="{'is-dragging': isDragging}"
               ></slot>
            </template>
            
          </RecursiveDraggable>
        </div>

      </div>
    </template>
  </draggable>
  </div>
</template>

<style scoped>
.nested-zone {
  padding-left: 0px;
  min-height: 0px;
}


.is-draggging :deep(.plus)

{
  opacity: 0 !important;
  pointer-events: none !important;

}
</style>