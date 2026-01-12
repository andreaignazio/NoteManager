<script setup>
import { computed } from 'vue';
import draggable from 'vuedraggable';
import usePagesStore from '@/stores/pages';
import { posBetween } from '@/domain/position'

defineOptions({name: 'NestedWrapper'});

const props = defineProps({
    list: { type: Array, required: true },
    parentId: { type: [String, Number], default: null } // Utile sapere chi è il padre attuale
});

const emit = defineEmits(['update:list']);
const pagesStore = usePagesStore();

// Getter/Setter per v-model (UI veloce)
const localChildren = computed({
    get: () => props.list,
    set: (val) => emit('update:list', val)
});

// --- LOGICA FRACTIONAL INDEXING ---
const onDragChange = async (event) => {
    // L'evento può essere 'moved' (stessa lista) o 'added' (da un'altra lista)
    const context = event.moved || event.added;
    if (!context) return;

    const { element, newIndex } = context;
    const newParentId = props.parentId; // L'ID del blocco che contiene questa lista

    // 1. Identifichiamo i vicini nella NUOVA lista (che è già aggiornata dal v-model)
    // localChildren qui contiene già l'ordine visivo corretto
    const siblings = localChildren.value;
    
    const prevBlock = siblings[newIndex - 1];
    const nextBlock = siblings[newIndex + 1];

    const prevPos = prevBlock ? prevBlock.position : null; // null se è il primo
    const nextPos = nextBlock ? nextBlock.position : null; // null se è l'ultimo

    // 2. Calcoliamo la nuova posizione
    const newPosition = posBetween(prevPos, nextPos);

    console.log(`Spostato ${element.id}.`, {
        daParent: element.parentId,
        aParent: newParentId,
        prevPos,
        nextPos,
        calcolata: newPosition
    });

    // 3. Aggiorniamo lo store (che aggiornerà il DB)
    // È CRUCIALE aggiornare subito lo store locale per evitare il "snap back"
    await pagesStore.patchPage(element.id, {
        parent: newParentId,
        position: newPosition
    });
};


</script>

<template>
    <draggable
        v-model="localChildren"
        group="notion-group"
        item-key="id"
        :animation="200"
        @change="onDragChange"  
    >
       <template #item="{element}">
           <NestedWrapper 
               v-model:list="element.children" 
               :parentId="element.id" 
           />
           </template>
    </draggable>
</template>