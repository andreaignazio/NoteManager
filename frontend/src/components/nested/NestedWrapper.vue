<script setup>
    import { computed } from 'vue';
    import draggable from 'vuedraggable';
    import usePagesStore from '@/stores/pages'
    import { posBetween } from '@/domain/position'
    import PageRowNS from '@/components/PageRowNS.vue';
    
    

    
    defineOptions({name: 'NestedWrapper'})

    const props = defineProps({
        list: {
            type: Array,
            required: true
        },
        parentId: {type: String, default: null}
    })

    const emit = defineEmits(['update:list'])
    const pagesStore = usePagesStore()


    const localChildren = computed({
        get: () => props.list,
        set: (value) => emit('update:list', value)
    })

    /*const onDragChange = async (event) => {
        // L'evento può essere 'moved' (stessa lista) o 'added' (da un'altra lista)
        const context = event.moved || event.added;
        if (!context) return;

        const { element, newIndex } = context;

        const newParentKey = props.parentId; // L'ID del blocco che contiene questa lista
        console.log("element:", element, "newIndex:", newIndex, "parentId:", newParentKey)
        

        const siblings = localChildren.value;
        console.log("siblings:", siblings[0])
        const prevBlockId = siblings[newIndex - 1]?.id;
        const nextBlockId = siblings[newIndex + 1]?.id;

        console.log("prevBlockId:", prevBlockId, "nextBlockId:", nextBlockId)
        const prevBlock = prevBlockId ? pagesStore.pagesById[prevBlockId] : null
        const nextBlock = nextBlockId ? pagesStore.pagesById[nextBlockId] : null

        let prevPos = prevBlock ? prevBlock.position : null; // null se è il primo
        let nextPos = nextBlock ? nextBlock.position : null; // null se è l'ultimo

        // 2. Calcoliamo la nuova posizione
        console.log("prevPos:", prevPos, "nextPos:", nextPos)
        
        if(nextPos && prevPos && nextPos <= prevPos) nextPos = '\uffff'
        const newPosition = posBetween(prevPos, nextPos);
        
        console.log(`Spostato ${element.id}.`, {
            daParent:pagesStore.pagesById[element.id].parentId,
            aParent: newParentKey,
            prevPos,
            nextPos,
            calcolata: newPosition
        });

        // 3. Aggiorniamo lo store (che aggiornerà il DB)
        // È CRUCIALE aggiornare subito lo store locale per evitare il "snap back"
        let newParentId = String(newParentKey)
        if(newParentKey && newParentKey==='root') newParentId=null
        try{
            await pagesStore.patchPage(element.id, {
            parent: newParentId,
            position: newPosition
        })
        } 
        catch(error){
            console.warn("Error patching:", error)
        }
       
    }*/

    const KEY_ROOT = 'root';

    const onDragChange = async (event) => {
        const context = event.moved || event.added;
        if (!context) return;

        const { element, newIndex } = context;

        let targetParentId = props.parentId;
        
        if (targetParentId === KEY_ROOT) {
            targetParentId = null;
        }

        const siblings = localChildren.value;
        const prevItem = siblings[newIndex - 1];
        const nextItem = siblings[newIndex + 1];

        // Usiamo ?.id per sicurezza
        const prevBlock = prevItem ? pagesStore.pagesById[prevItem.id] : null;
        const nextBlock = nextItem ? pagesStore.pagesById[nextItem.id] : null;

        const prevPos = prevBlock?.position || null;
        const nextPos = nextBlock?.position || null;


        const newPosition = posBetween(prevPos, nextPos);

        console.log(`Spostamento:`, {
            id: element.id,
            toParent: targetParentId, // Sarà 'null' (vero) o 'uuid'
            prevPos,
            nextPos,
            newPos: newPosition
        });

        // ---------------------------------------------------------
        // 4. AGGIORNAMENTO STORE (OTTIMISTICO)
        // ---------------------------------------------------------
        // Aggiorniamo subito lo stato locale così se l'utente sposta un altro
        // elemento subito dopo, i calcoli si basano sui dati nuovi.
        // Nota: Assicurati che updateLocalPage gestisca 'null' correttamente
        /*pagesStore.updateLocalPage(element.id, {
            parentId: targetParentId, 
            position: newPosition
        });*/

        // ---------------------------------------------------------
        // 5. CHIAMATA API
        // ---------------------------------------------------------
        try {
            await pagesStore.patchPage(element.id, {
                parent: targetParentId, // Mando null se era root
                position: newPosition
            });
        } catch (error) {
            console.error("Errore salvataggio posizione:", error);
            // Qui potresti fare un rollback o un refetch
            // pagesStore.fetchPages();
        }
    }


</script>

<template>
    <draggable
    v-model="localChildren"
    group="notion-group"
    item-key="id"
    ghost-class="ghost-card"
    drag-class="drag-card"
    handle=".drag-handle"
    :animation="200"
    :fallback-tolerance="3"
    @change="onDragChange"
    >
        <template #item="{element}">
            <div class="block-wrapper">
                <div class="block-row">
                    <div class="drag-handle">⋮⋮</div>
                    <input class="block-input"
                     :value="pagesStore.pagesById[String(element.id)]?.title ?? '' "/>
                    
                </div>

                <div class="nested-zone" :class="{'is-empty': (element.children?.length ?? 0)===0}">
                    <NestedWrapper 
                    v-model:list="element.children"
                    :parentId="element.id"
                    />
                </div>

            </div>
        </template>
    </draggable>
</template>


<style scoped>
/* Stile base del blocco */
.block-wrapper {
  margin-bottom: 2px;
}

.block-row {
  display: flex;
  align-items: center;
  padding: 4px 0;
  border-radius: 4px;
}

.block-row:hover {
  background-color: #f7f6f3; /* Grigio chiaro Notion al passaggio del mouse */
}

/* Maniglia stile Notion */
.drag-handle {
  cursor: grab;
  color: #999;
  padding: 0 6px;
  font-size: 18px;
  opacity: 0; /* Nascosto finché non fai hover */
  transition: opacity 0.2s;
}

.block-row:hover .drag-handle {
  opacity: 1;
}

.block-input {
  border: none;
  background: transparent;
  width: 100%;
  font-size: 16px;
  outline: none;
  font-family: sans-serif;
}

/* Indentazione fondamentale */
.nested-zone {
  padding-left: 24px;
  min-height: 10px; /* IMPORTANTE: permette di droppare dentro anche se vuoto */
}

.is-empty {
   /* border: 1px dashed #eee; */ 
}

/* Stili visuali del Drag & Drop */
.ghost-card {
  background-color: #e1f5fe; /* Azzurro quando spazio viene creato */
  opacity: 1;
  border-radius: 4px;
}
.ghost-card > .nested-zone {
    /* Nasconde i figli mentre trascini il padre per pulizia visiva (opzionale) */
    display: none; 
}

.drag-card {
  opacity: 1; 
  background: white;
  box-shadow: 0 5px 15px rgba(0,0,0,0.15);
  transform: rotate(2deg); /* Piccolo tocco estetico */
}
</style>