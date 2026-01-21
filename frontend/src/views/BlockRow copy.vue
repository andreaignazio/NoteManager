<script setup>
   import BlockEditor from '@/views/BlockEditor.vue';
   import { useBlocksStore } from '@/stores/blocks'
   import { nextTick, computed, ref, onMounted,onUnmounted, toRef,watch } from 'vue';
  import { classForTextToken, classForBgToken } from '@/theme/colorsCatalog'
   
  const blocksStore = useBlocksStore()

   const props = defineProps({
    block: Object,
    pageId: String,
    level: Number,
    parentKey: String,
    registerMenuAnchor: Function,
    blockActionMenuId: String,
   })

   const menuBtn = ref(null)
   const langBtn = ref(null)
   const isCallout = computed(() => props.block.type === 'callout')

   onMounted(() => {
  if (menuBtn.value) {props.registerMenuAnchor?.(props.block.id,menuBtn.value,'actions')}
  if (props.block.type === 'code' && langBtn.value) {
    props.registerMenuAnchor?.(props.block.id,langBtn.value,'lang')}
})

  onUnmounted(() => {

    props.registerMenuAnchor?.(props.block.id,null,'actions')
    props.registerMenuAnchor?.(props.block.id,null,'lang' )
  })
  //===COLOR PICKER====
  const styleClasses = computed(() => {
  const s = props.block?.props?.style ?? {}
 // console.log("BLOCKROW:", s.bgColor)
  //console.log(classForBgToken(s.bgColor))
 
  return [
    classForTextToken(s.textColor ?? 'default'),
    classForBgToken(s.bgColor ?? 'default'),
  ]
})

const style = ref(null)
watch(props.block?.props?.style, (newStyle) => {
      const textColor = classForTextToken(newStyle.textColor ?? 'default')
      const bgColor = classForTextToken(newStyle.textColor ?? 'default')
})

  //===CONVERSIONI TEXT-> CODE OR CODE->TEXT
  watch(
  () => props.block.type,
  (t) => {
    // quando diventa code: registra anchor lang
    if (t === 'code' && langBtn.value) {
      props.registerMenuAnchor?.(props.block.id, langBtn.value, 'lang')
    }
    // quando smette di essere code: deregistra anchor lang
    if (t !== 'code') {
      props.registerMenuAnchor?.(props.block.id, null, 'lang')
    }
  }
)


   const emit = defineEmits(['open-menu', 'open-lang-menu'])

   function handleOpenMenu(e) {
    emit('open-menu', props.block.id)
   }
   function handleOpenLangMenu() {
    emit('open-lang-menu', props.block.id)
  }

 

  function handleToggleWrap() {
    console.log("TOGGLE WRAP for block:", props.block.id)
    blocksStore.updateBlockContent(props.block.id, { wrap: !(props.block.content?.wrap ?? true) })
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

const isHighlighted = ref(false)

const  blockActionMenuId = toRef(props, 'blockActionMenuId')

watch(
   blockActionMenuId,
  (newId) => {
    //console.log("blockActionMenu:", newId)
    isHighlighted.value =
      typeof newId === 'string' &&
      newId.includes(String(props.block?.id)) && newId.includes(String('blockRow'))
  },
  { immediate: true }
)
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
    <div
      class="row"
      :class="[
        { highlighted: isHighlighted },
        { 'is-code-card': block.type === 'code' },
        {'is-callout': isCallout}
      ]"
      :style="{background: `var(--${classForBgToken(block.props.style.bgColor)})`,}"
    >
      <div class="blockContent" :class="styleClasses"
      :style="{ color: `var(--${classForTextToken(block.props.style.textColor)})`,
         background: `var(--c-text-${block.props.style.bgColor})` }">
        <BlockEditor :block="block" :pageId="pageId" />
      </div>

      <div class="blockActions">
        <!-- Wrap toggle (solo code) -->
         <div v-if="block.type === 'code'" class="code-pills">
        <button
          v-if="block.type === 'code'"
          class="wrap-pill"
          type="button"
          :title="(block.content?.wrap ?? true) ? 'Wrap: ON' : 'Wrap: OFF'"
          @click.stop="handleToggleWrap"
        >
          {{ (block.content?.wrap ?? true) ? '↩︎' : '↔︎' }}
        </button>

        <!-- Language pill (solo code) -->
        <button
          v-if="block.type === 'code'"
          ref="langBtn"
          class="lang-pill"
          type="button"
          @click.stop="handleOpenLangMenu"
        >
          {{ block.content?.language ?? 'plaintext' }} 
        </button>
        </div>
        <!-- Dots (sempre) -->
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
/* ROW base: grid con colonna azioni fissa */
.row {
  display: grid;
  grid-template-columns: 1fr var(--block-actions-w);
  align-items: stretch;
  gap: 6px;

  padding: 0 0 4px var(--block-row-pad-x);
  border-radius: 5px;
  padding-right: 4px;
  padding-top:4px;
  padding-bottom:4px;
}

/* ========== CODE CARD ========== */
.row.is-code-card {
  /* card styling in tema chiaro */
  border: 0px solid rgba(0,0,0,.10);
  background: rgba(0,0,0,.02);
  border-radius: 12px;

  /* qui diamo un po' più respiro */
  padding-bottom: 8px;
  margin-top: 5px;
  margin-bottom: 5px;
}
.code-pills{
  position: absolute;
  top: var(--code-toolbar-top);
  right: calc(var(--block-actions-w) + var(--code-actions-gap));
  display: inline-flex;
  gap: 6px;
  opacity: 0;
  pointer-events: none;
}
.block-item:hover .code-pills,
.block-item:focus-within .code-pills{
  opacity: 1;
  pointer-events: auto;
}

/* wrap-pill e lang-pill ora NON più absolute */
.wrap-pill, .lang-pill{
  position: static;
  opacity: 1;
  pointer-events: auto;
}




/* ========== CALLOUT ========== */

.row.is-callout{

  border-radius: 16px;
}

/* Spingiamo il contenuto sotto la top bar (solo code) */
.row.is-code-card .blockContent {
  padding-top: var(--code-toolbar-h);
  min-width: 0;
}

/* hover SOLO sul contenuto */
.block-item:hover .row {
  /*background: rgba(0, 0, 0, 0.03);*/
  
}

.highlighted{
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
  border-radius: 12px;
}

/* Actions column sempre uguale (allineamento dots) */
.blockActions {
  position: relative;
  display: block;
  width: var(--block-actions-w);
}
/* Actions column sempre uguale (allineamento dots) */
.blockActions {
  position: relative;
  display: block;
  width: var(--block-actions-w);
}

/* Dots: sempre ancorati in alto a destra (ma visibili solo hover/focus come già fai) */
.dots {
  position: absolute;
  top: var(--code-toolbar-top);
  right: 0;

  width: var(--block-row-btn);
  height: var(--block-row-btn);
  border-radius: 8px;
  border: 0;
  background: transparent;
  cursor: pointer;

  opacity: 0;
  pointer-events: none;
}

.block-item:hover .dots,
.block-item:focus-within .dots {

  opacity: 1;
  pointer-events: auto;
}

.dots:hover{
  background: rgba(0,0,0,.06);
  color: rgba(0,0,0,.85);
}


.block-item .icon-ghost {
  opacity: 0;
  pointer-events: none;
}

.block-item:hover .icon-ghost,
.block-item:focus-within .icon-ghost {
  opacity: 1;
  pointer-events: auto;
}



/* Pill: assoluto, a sinistra del gutter dots, così non sposta layout */
.lang-pill {
  position: absolute;
  top: var(--code-toolbar-top);
  right: calc(var(--block-actions-w) + var(--code-actions-gap));

  height: var(--block-row-btn);
  border-radius: var(--bar-radius);
  border: 0px solid rgba(0,0,0,.10);
  background: rgba(0,0,0,.03);
  cursor: pointer;

  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  gap: 6px;

  color: rgba(0,0,0,.70);
  font-size: 13px;

  opacity: 0;
  pointer-events: none;
}

.block-item:hover .lang-pill,
.block-item:focus-within .lang-pill {
  opacity: 1;
  pointer-events: auto;
}

.lang-pill:hover {
  background: rgba(0,0,0,.06);
  color: rgba(0,0,0,.85);
}

.lang-pill::after {
  content: '▾';
  font-size: 11px;
  margin-left: 4px;

  opacity: 0;
  transform: translateY(-1px);
  transition: opacity 120ms ease;
}

/* SOLO hover sul bottone */
.lang-pill:hover::after {
  opacity: .6;
}

.block-item:hover .lang-pill::after,
.block-item:focus-within .lang-pill::after {
  opacity: .6;
}

</style> 