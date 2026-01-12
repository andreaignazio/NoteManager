<script setup>
import { ref, toRef, watch, nextTick, onMounted, onUnmounted, computed } from 'vue'
import { getIconComponent } from '@/icons/catalog'

const props = defineProps({
  row: {
    type: Object,
    required: true, // { page, level }
  },
  isActive: {
    type: Boolean,
    default: false,
  },
  isEditing: {
    type: Boolean,
    default: false,
  },
  draftTitle: {
    type: String,
    default: '',
  },
  indentPx: {
    type: Number,
    default: 24,
  },
  hasChildren: {
    type: Boolean,
  },
  isExpanded: {
    type: Boolean,
  },
  registerMenuAnchor: {
    type: Function
  },
  pagesMenu:{
    type:Object
  },
  parentKey:{
    type:String
  },
  pageActionMenuId:{
    type: String
  }
})

const emit = defineEmits([
  'open',
  'start-edit',
  'add-child',
  'toggle-expand',
  'delete',
  'commit',
  'cancel',
  'update:draftTitle',
  'open-menu'
])

const inputEl = ref(null)
const editorEl = ref(null)

const PageIcon = computed(() =>
  getIconComponent(props.row.page?.icon)
)

function onOpen() {
  // Non aprire mentre stai editando (stesso comportamento del tuo template)
  if (props.isEditing) return
  emit('open', props.row.page.id)
}

function onInput(e) {
  emit('update:draftTitle', e.target.value ?? '')
}

function onToggleExpand() {
  if (!props.hasChildren) return
  emit('toggle-expand', props.row.page.id)
}

// Autofocus quando entri in edit mode
watch(
  () => props.isEditing,
  async (val) => {
    if (!val) return
    await nextTick()
    inputEl.value?.focus?.()
    inputEl.value?.select?.()
  }
)

const isHighlighted = ref(false)

const pageActionMenuId = toRef(props, 'pageActionMenuId')

watch(
  pageActionMenuId,
  (newId) => {
    isHighlighted.value =
      typeof newId === 'string' &&
      newId.includes(String(props.row.page.id)) && newId.includes(String('sidebar'))
  },
  { immediate: true }
)
/*watch(
  () => props.pagesMenu?.isOpen,
  (isOpen) => {
    isHighlighted.value =
      !!isOpen && String(props.pagesMenu?.pageId) === String(props.row.page.id)
  },
  { immediate: true }
)*/
/*const isHighlighted = computed(() =>
  !!props.pagesMenu?.isOpen &&
  String(props.pagesMenu.pageId) === String(props.row.page.id)
)*/

const menuBtn = ref(null)
onMounted(() => {
  props.registerMenuAnchor?.(props.row.page.id, menuBtn.value)
})

onUnmounted(()=>{
  props.registerMenuAnchor?.(props.row.page.id, null)
})

function onOpenMenu() {
  const el = menuBtn.value
  if(!el) return
  //const rect = el.getBoundingClientRect().toJSON()
  emit('open-menu', props.row.page.id)
  //console.log(rect)
}

</script>

<template>
  <li
    class="page-item"
    :class="{ 'active': isActive, 'highlighted' : isHighlighted }"
    :style="{ paddingLeft: `${row.level * indentPx}px` }"
    :data-id="row.page.id"
    :data-parent="parentKey"
    @click="onOpen"
  >
    <!-- VIEW MODE -->
    <div
      v-if="!isEditing"
      class="page-row"
      @dblclick.stop="emit('start-edit', row.page)"
    >
    <div class="row-inner">
     <!-- drag handle -->
     <button class="drag-handle" type="button" title="Drag" @click.stop>
        ⋮⋮
      </button>
    
      <!--ICON/CHEVRON-->
    <div
      class="leading"
      :class="{ 'has-children': hasChildren,'expanded' : isExpanded  }"
      @click.stop="onToggleExpand"
      :title="hasChildren ? (isExpanded ? 'Collapse' : 'Expand') : ''"
    >
      <span class="chevron" aria-hidden="true">
        {{ isExpanded ? '▾' : '▸' }}
      </span>
     <span class="page-icon" aria-hidden="true">
      <component :is="PageIcon" :size="16" />
      </span>
    </div>

      <!--PAGE-TITLE-->
      <span class="page-title-text" :title="row.page.title">
        {{ row.page.title }}
        <!--<p class="debugId">{{row.page.id}}</p>-->
      </span>
    </div>
      
      <!--ROW ACTIONS-->
      <div class="row-actions" @click.stop>
        <button class="icon-btn" @click="emit('add-child', row.page.id)">+</button>
        <button ref="menuBtn" class="icon-btn menu-anchor" @click.stop="onOpenMenu">...</button> 
      </div>
      <!--<p class="debug">{{row.page.position}}</p>-->
    </div>

    <!-- EDIT MODE -->
    <div
      v-else
      ref="editorEl"
      class="page-row editor"
      @click.stop
    >
      <input
        ref="inputEl"
        class="edit-input"
        :value="draftTitle"
        @input="onInput"
        @keydown.enter.prevent="emit('commit', row.page.id)"
      />

      <div class="row-actions" @click.stop>
        <button class="icon-btn primary" @click="emit('commit', row.page.id)">Save</button>
        <button class="icon-btn" @click="emit('cancel')">Cancel</button>
      </div>
    </div>
  </li>
  <!--<p class="debug">POS:{{row.page.position}} ID: {{ row.page.id }}</p>-->
  <!--<p class="debug">{{ parentKey }}</p>-->
</template>

<style scoped>

.drag-handle {
  width: 0;                /* 👈 collassato */
  opacity: 0;
  margin-right: 0;
  overflow: hidden;

  transition:
    width 140ms ease,
    opacity 120ms ease,
    margin-right 140ms ease;

  height: 28px;
  border-radius: 8px;
  border: 0px solid rgba(0,0,0,.12);
 background: rgba(255,255,255,.7);
  background: rgba(255,255,255,.7);
  cursor: grab;

  display: inline-flex;
  align-items: center;
  justify-content: center;
}
/*.drag-handle:hover{
   background: rgba(255, 255, 255, 0.192);
}*/
.drag-handle {
  transition-delay: 40ms;
}

.page-item:hover .drag-handle,
.page-item.active .drag-handle {
  width: 28px;            /* 👈 spazio reale */
  opacity: 1;
  margin-right: 6px;      /* 👈 spinge tutto a destra */
}
.page-item:focus-within .drag-handle {
  width: 28px;
  opacity: 1;
  margin-right: 6px;
}

.drag-handle:active {
  cursor: grabbing;
}

.debug {
  font-size: 12px;
}
.debugId {
  font-size: 8px;
}
.page-item {
  border-radius: 10px;
  cursor: pointer;
}

.page-item:hover {
  background: rgba(0,0,0,.06);
}

.page-item.active {
  background: rgba(0,0,0,.08);
}
.page-item.highlighted {
  background: rgba(0,0,0,.08);
}


.page-row {
  display: flex;
  align-items: center;
  padding: 6px 6px;
  gap: 10px;
  
}

.row-inner {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.page-title-text {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 14px;
}

.row-actions {
  display: flex;
  gap: 6px;
  opacity: 0;
  pointer-events: none;
   transition: opacity 120ms ease;
}

.page-item:hover .row-actions,
.page-item.active .row-actions,
.page-row.editor .row-actions {
  opacity: 1;
  pointer-events: auto;
}

/*.page-item.drop-inside {
  background: rgb(151, 151, 188);
  outline: 2px solid var(--accent);
  border-radius: 8px;
}*/

/* Inputs / buttons */
.input {
  height: 34px;
  padding: 0 10px;
  border-radius: 10px;
  border: 1px solid rgba(0,0,0,.14);
  background: #fff;
  outline: none;
}

.input:focus {
  border-color: rgba(0,0,0,.28);
}

.edit-input {
  flex: 1;
  min-width: 0;
  height: 34px;
  padding: 0 10px;
  border-radius: 10px;
  border: 1px solid rgba(0,0,0,.18);
  background: #fff;
  outline: none;
}

.btn {
  height: 34px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid rgba(0,0,0,.14);
  background: rgba(0,0,0,.04);
  cursor: pointer;
}

.btn:hover {
  background: rgba(0,0,0,.07);
}

.btn.primary {
  background: rgba(0,0,0,.12);
}

.icon-btn {
  height: 28px;
  width: 28px;
  align-items: center;
  padding: 0 10px;
  border-radius: 10px;
  border: 0px solid rgba(0,0,0,.12);
  background: rgba(255,255,255,.7);
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  opacity: 1;
  transition: opacity 120ms ease;
   
}

.icon-btn:hover {
  
  background: #fff;
  background: rgba(255, 255, 255, 0.402);
}

.icon-btn.primary {
  background: rgba(0,0,0,.12);
}

.icon-btn.danger {
  border-color: rgba(255,0,0,.25);
}

.leading {
  width: 22px;
  height: 22px;
  position: relative;          /* 👈 */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-right: 6px;
  flex: 0 0 auto;
  border-radius: 6px;
}

/* i due layer occupano lo stesso identico spazio */
.leading .chevron,
.leading .page-icon {
  position: absolute;          /* 👈 */
  inset: 0;                    /* 👈 */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: opacity 120ms ease;
}

/* styling chevron */
.leading .chevron {
  font-size: 14px;
  line-height: 1;
}

/* SVG lucide */
.page-icon :deep(svg) {
  display: block;
}

/*.leading .chevron { display: none; }
.leading .page-icon { display: inline; }

.page-item:hover .leading.has-children .chevron { display: inline; opacity: 0.6; }
.page-item:hover .leading.has-children .page-icon { display: none; }

.page-item .leading.has-children.expanded .chevron { display: inline; opacity: 1;}
.page-item .leading.has-children.expanded .page-icon { display: none;}

.leading.has-children { cursor: pointer; }*/
.leading .chevron { visibility: hidden; opacity: 0; }
.leading .page-icon { visibility: visible; opacity: 1; }

.page-item:hover .leading.has-children .chevron {
  visibility: visible;
  opacity: 0.65;
}
.page-item:hover .leading.has-children .page-icon {
  visibility: hidden;
  opacity: 0;
}

.page-item .leading.has-children.expanded .chevron {
  visibility: visible;
  opacity: 1;
}
.page-item .leading.has-children.expanded .page-icon {
  visibility: hidden;
  opacity: 0;
}

.leading .chevron,
.leading .page-icon {
  transition: opacity 120ms ease;
}

</style>
