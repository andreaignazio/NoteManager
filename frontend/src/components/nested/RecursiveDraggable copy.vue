<script setup>
import { computed, ref} from 'vue';
import draggable from 'vuedraggable';
import { posBetween } from '@/domain/position'; // Utility pura, ok importarla qui o passarla come prop

defineOptions({ name: 'RecursiveDraggable' });

const props = defineProps({
  list: { type: Array, required: true },
  parentId: { type: [String, null], default: null },
  groupName: { type: String, default: 'generic-tree' }, // Nome gruppo dinamico
  rootKey: { type: String, default: 'root' }, // Configurazione per la root
  enableAnimation: { type: Boolean, default: true },
  enableSpringLoading: { type: Boolean, default: true }
});

const emit = defineEmits(['update:list', 'node-moved','req-expand']);

const localChildren = computed({
  get: () => props.list,
  set: (value) => emit('update:list', value)
});

//SPRING LOADING
const hoverTimer = ref(null);
const lastHoveredId = ref(null);
const draggingOverId = ref(null);
/*
const onMoveCallback = (evt, originalEvent) => {
    // evt.relatedContext.element è l'oggetto su cui stiamo passando sopra
    const targetElement = evt.relatedContext.element;
    
    if (!targetElement) return false; // Continua normalmente

    // Se l'elemento è diverso dall'ultimo hoverato, resetta il timer
    if (lastHoveredId.value !== targetElement.id) {
        clearTimeout(hoverTimer.value);
        lastHoveredId.value = targetElement.id;
        evt.related.classList.remove('is-hovering-folder');
        // Se l'elemento NON è espanso, facciamo partire il conto alla rovescia
        if (!targetElement.isExpanded) {

            evt.related.classList.add('is-hovering-folder');
            hoverTimer.value = setTimeout(() => {
                console.log("Spring Loading: Open", targetElement.id);
                // Emettiamo l'evento per dire allo store di aprire questa pagina
                emit('req-expand', targetElement.id);
                evt.related.classList.remove('is-hovering-folder');
            }, 600); // 600ms di attesa (standard UX)
        }
    }
    
    // Ritorna false per impedire il drop immediato? No, vogliamo permettere il sort.
    // Ritorna true o undefined per permettere il movimento standard.
};

const onDragEnd = () => {
    clearTimeout(hoverTimer.value);
    lastHoveredId.value = null;
};*/
const onMoveCallback = (evt) => {
    if (!props.enableSpringLoading) return true;
    const targetElement = evt.relatedContext.element;
    const targetDomEl = evt.related; // Il div HTML vero e proprio

    // Se non stiamo puntando nulla di valido, permetti tutto
    if (!targetElement) return true;

    // 1. GESTIONE SPRING LOADING (Hover to expand)
    if (targetElement.id !== draggingOverId.value) {
        // Cambio di target: Pulisci il vecchio
        clearTimerAndHighlight(); 
        
        // Se è una cartella chiusa (o chiudibile), iniziamo il processo
        // Nota: puoi rimuovere !isExpanded se vuoi permettere il drop anche su cartelle aperte
        // ma di solito serve solo per quelle chiuse per vederne il contenuto.
        if (!targetElement.isExpanded) {
            
            draggingOverId.value = targetElement.id;
            
            // Aggiungiamo classe visiva manuale (perché bloccheremo il sort)
            targetDomEl.classList.add('is-hovering-target');

            hoverTimer.value = setTimeout(() => {
                console.log("Expanding:", targetElement.id);
                emit('req-expand', targetElement.id);
                // Una volta espanso, puliamo l'highlight così l'utente capisce che è successo
                clearTimerAndHighlight(); 
            }, 800); // 800ms è un buon compromesso (non troppo veloce)
            
            // 🔥 IL TRUCCO: BLOCCA LO SWAP!
            // Ritornando false, l'elemento sotto rimane FERMO come una roccia.
            // L'utente può puntarlo comodamente.
            return false; 
        }
    } else {
        // Se siamo ancora sullo stesso elemento bloccato, continua a bloccare
        if (draggingOverId.value) return false;
    }

    // Se non è una cartella chiusa, lascia che vuedraggable faccia il normale swap
    return true; 
};


// Funzione di pulizia
const clearTimerAndHighlight = () => {
    if (hoverTimer.value) clearTimeout(hoverTimer.value);
    hoverTimer.value = null;
    
    // Rimuoviamo la classe da tutti gli elementi che potrebbero averla
    document.querySelectorAll('.is-hovering-target').forEach(el => {
        el.classList.remove('is-hovering-target');
    });
    draggingOverId.value = null;
};

const onDragEnd = () => {
    clearTimerAndHighlight();
};


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
    element: element // Passiamo l'intero oggetto se serve
  });
};

// Funzione per inoltrare l'evento dai figli ricorsivi al padre (Bubbling manuale)
const handleChildMove = (payload) => {
  emit('node-moved', payload);
};

///====ANIMATION ACCORDION====
const shouldAnimate = () => props.enableAnimation;
// 1. Prima di entrare: Setta altezza a 0 e nascondi overflow
const onBeforeEnter = (el) => {
  if (!shouldAnimate()) return;
  el.style.height = '0';
  el.style.opacity = '0';
  el.style.overflow = 'hidden';
};

// 2. Durante l'entrata: Calcola l'altezza target e anima verso di essa
const onEnter = (el, done) => {
  if (!shouldAnimate()) {done(); return;}
  // Forziamo il browser a calcolare l'altezza del contenuto
  const height = el.scrollHeight;
  
  // Forziamo un reflow per assicurarci che il browser registri lo stato iniziale (height: 0)
  // prima di impostare l'altezza target. Basta leggere una proprietà di layout.
  el.getBoundingClientRect(); 

  // Impostiamo l'altezza target e l'opacità per avviare la transizione CSS
  el.style.height = `${height}px`;
  el.style.opacity = '1';
  
  // Diciamo a Vue quando la transizione è finita
  el.addEventListener('transitionend', done, { once: true });
};

// 3. Dopo l'entrata: Pulisci gli stili inline per lasciare che il CSS gestisca
const onAfterEnter = (el) => {
  if (!shouldAnimate()) return;
  el.style.height = 'auto'; // Importante per permettere ai figli di ridimensionarsi
  el.style.overflow = 'visible'; // O '' per il default
};

// 4. Prima di uscire: Setta l'altezza attuale esplicita per poter animare verso 0
const onBeforeLeave = (el) => {
  if (!shouldAnimate()) return;
  el.style.height = `${el.scrollHeight}px`;
  el.style.overflow = 'hidden';
};

// 5. Durante l'uscita: Anima verso 0
const onLeave = (el, done) => {
  if (!shouldAnimate()) {
    done();          
    return;
  }
  // Reflow necessario
  el.getBoundingClientRect(); 

  el.style.height = '0';
  el.style.opacity = '0';
  el.addEventListener('transitionend', done, { once: true });
};



</script>

<template>
  <draggable
    v-model="localChildren"
    :group="groupName"
    item-key="id"
    ghost-class="ghost-card"
    drag-class="drag-card"
    handle=".drag-handle"
    :animation="300"

    :swap-threshold="0.50" 
    :invert-swap="false"

    :move="onMoveCallback"
    @change="onDragChange"
    @end="onDragEnd"

  >
    <template #item="{ element }">
      <div class="draggable-item">
        <slot name="row" :element="element"></slot>
        <Transition
          name="accordion"
          @before-enter="onBeforeEnter"
          @enter="onEnter"
          @after-enter="onAfterEnter"
          @before-leave="onBeforeLeave"
          @leave="onLeave"
        >
        <div 
        v-if="element.isExpanded && element.children && element.children.length > 0"
        class="nested-zone" 
        :class="{ 'is-empty': (element.children?.length ?? 0) === 0 }">

          <RecursiveDraggable
            v-model:list="element.children"
            :parent-id="element.id"
            :group-name="groupName"
            :root-key="rootKey"

            :enable-animation="enableAnimation"
            :enable-spring-loading="enableSpringLoading"

            @node-moved="handleChildMove"
            @req-expand="(id) => emit('req-expand', id)"
          >
            <template #row="{ element: childElement }">
               <slot name="row" :element="childElement"></slot>
            </template>
            
          </RecursiveDraggable>
        </div>
        </Transition>
      </div>
    </template>
  </draggable>
</template>

<style scoped>
.nested-zone {
  padding-left: 20px;
  /*min-height: 10px;*/
}

.accordion-enter-active,
.accordion-leave-active {
  /* Animiamo altezza e opacità per fluidità */
  transition: height 0.3s ease-in-out, opacity 0.3s ease-in-out;
}
</style>