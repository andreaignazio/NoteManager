<script setup>
import { ref, watch, nextTick, onMounted, onUnmounted, computed, toRef } from 'vue'
import { getIconComponent } from '@/icons/catalog'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()

const props = defineProps({

  page: { type: Object, required: true },
  level: { type: Number, default: 0 },
  hasChildren: { type: Boolean, default: false },

  isActive: { type: Boolean, default: false },
  isEditing: { type: Boolean, default: false },
  draftTitle: { type: String, default: '' },

  isExpanded: { type: Boolean, default: false },

  registerMenuAnchor: { type: Function },
  pagesMenu: { type: Object },

  parentKey: { type: String },
  pageActionMenuId: { type: String },
  flash: { type: Boolean, default: false },
  anchorScope: { type: String, default: 'tree' },
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
  'open-menu',
])

const inputEl = ref(null)
const editorEl = ref(null)

const PageIcon = computed(() => getIconComponent(props.page?.icon))

function onOpen() {
  console.log("Clicked on page:", props.page.id, "Title:", props.page.title)
  if (props.isEditing) return
  emit('open', props.page.id)
}

function onInput(e) {
  emit('update:draftTitle', e.target.value ?? '')
}

function onToggleExpand() {
  emit('toggle-expand', props.page.id)
}

// autofocus in edit
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
      newId.includes(String(props.page.id)) &&
      newId.includes(props.anchorScope)
  },
  { immediate: true }
)

const menuBtn = ref(null)


watch(
  () => menuBtn.value,
  (el) => {
    props.registerMenuAnchor?.(props.anchorScope, props.page.id, el)
  },
  { immediate: true }
)

const isLastAddedPage = computed(() => {
 
  const lastAddedPageId = ui.getLastAddedPageId()
  return lastAddedPageId === props.page.id
})



/*onMounted(() => {
  props.registerMenuAnchor?.(props.page.id, menuBtn.value)
})*/

onUnmounted(() => {
  props.registerMenuAnchor?.(props.anchorScope, props.page.id, null)
})

function onOpenMenu() {
  if (!menuBtn.value) return
  emit('open-menu', { pageId: props.page.id, scope: props.anchorScope })
}
</script>

<template>
  <div class="item-wrapper">
  
    <div
      class="page-item"
      :class="{ active: isActive, highlighted: isHighlighted,
        'moved-flash': flash || isLastAddedPage,
        'pie-drop-hover': ui.SidebarMoveToArmed && ui.SidebarMoveToHoverPageId === page.id
         }"
      :data-id="page.id"
      :data-page-id="page.id" 
      :data-parent="parentKey"
      @click="onOpen"
    >
      <!-- VIEW MODE -->
      <div
        v-if="!isEditing"
        class="page-row"
        @dblclick.stop="emit('start-edit', page)"
      >
        <div class="row-inner">
         
          <button class="drag-handle" type="button" title="Drag" @click.stop>
            ⋮⋮
          </button>

          <!-- ICON/CHEVRON -->
          <div
            class="leading"
            :class="{ 'has-children': hasChildren, expanded: isExpanded }"
            @click.stop="onToggleExpand"
            :title="isExpanded ? 'Collapse' : 'Expand'"
          >
            <span class="chevron" 
            :class="{active:isActive}"
            aria-hidden="true" >
              {{ isExpanded ? '▾' : '▸' }}
            </span>
            <span class="page-icon"
            :class="{active:isActive}"
            aria-hidden="true">
              <component :is="PageIcon" :size="16" />
            </span>
          </div>

          <!-- TITLE -->
          <span class="page-title-text"
            :class="{ active: isActive }"
           :title="page.title">
            {{ String(page.title).trim() != '' ? page.title : 'Untitled' }}
          </span>

          <!-- debug opzionali -->
         <!--<span class="debug">{{ page.position }}</span>
          <span class="debug">{{ String(page.id).slice(0, 3) }}</span>--> 
        </div>

        <!-- ACTIONS -->
        <div class="row-actions" @click.stop>
          <button class="icon-btn" @click="emit('add-child', page.id)">+</button>
          <button ref="menuBtn" class="icon-btn menu-anchor" @click.stop="onOpenMenu">...</button>
        </div>
      </div>

      <!-- EDIT MODE -->
      <div v-else ref="editorEl" class="page-row editor" @click.stop>
        <input
          ref="inputEl"
          class="edit-input"
          :value="draftTitle"
          @input="onInput"
          @keydown.enter.prevent="emit('commit', page.id)"
        />

        <div class="row-actions" @click.stop>
          <button class="icon-btn primary" @click="emit('commit', page.id)">Save</button>
          <button class="icon-btn" @click="emit('cancel')">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
:root {
  --sidebar-row-pad-y: 6px;   /* spazio verticale interno */
  --sidebar-row-gap: 4px;     /* spazio tra righe */
  --sidebar-row-radius: 10px;
}

.page-item.pie-drop-hover {
  background-color: #4c93e080;
  /*background-color: blue;*/
  outline: 2px solid #74b5fadc;
  z-index: 2000;
  animation: opacityPulse 800ms ease-in-out;
}

.item-wrapper {
  width: 100%;
  min-height: 32px; 
  margin-bottom: var(--sidebar-row-gap);
  margin-top: var(--sidebar-row-gap);
}

.drag-handle {
  width: 0px;
  opacity: 0;
  margin-right: 0;
  overflow: hidden;

  transition:
    width 200ms ease,
    opacity 120ms ease,
    margin-right 200ms ease;

  height: var(--sidebar-handle-h);
  border-radius: var(--sidebar-row-radius);
  border: 0px solid rgba(0,0,0,.12);
  background: var(--bg-icon-light);
  color:var(--icon-secondary);
  cursor: grab;

  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.drag-handle { transition-delay: 40ms; }

.page-item:hover .drag-handle,
.page-item.active .drag-handle,
.page-item:focus-within .drag-handle {
  width:  var(--sidebar-handle-h);
  opacity: 1;
  margin-right: 6px;
}

.drag-handle:active { cursor: grabbing; }

.debug { font-size: 12px; }

.page-item {
  width: 100%;
  display: block;
  border-radius: 10px;
  cursor: pointer;
  min-height: 15px;
}

.page-item:hover { background: rgba(0,0,0,.06); }
.page-item.active { background: rgba(0,0,0,.08); }
.page-item.highlighted { background: rgba(0,0,0,.08); }

.page-row {
  display: flex;
  align-items: center;
  padding: var(--sidebar-row-pad-y) var(--sidebar-row-pad-y);
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
  color: var(--text-secondary);
}
.page-title-text.active{
  color: var(--text-main);
}

/*.row-actions {
  display: flex;
  gap: 6px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 120ms ease;
}*/
.row-actions {
  position: absolute;          
  right: var(--sidebar-row-pad-y);                
  top: 50%;
  transform: translateY(-50%);
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

.page-item:hover .page-title-text,
.page-item.active .page-title-text,
.page-row.editor .page-title-text {
  padding-right: 70px;
}

.page-title-text {
  transition: padding-right 120ms ease;
}
/* edit input */
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

.icon-btn {
  height: var(--sidebar-handle-h);
  width: var(--sidebar-handle-h);
  align-items: center;
  padding: 0 10px;
  border-radius: 8px;
  border: 0px solid rgba(0,0,0,.12);
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  opacity: .25;
  transition: opacity 120ms ease;
  color:var(--icon-secondary)
}

.icon-btn:hover {
   background:  var(--bg-icon-hover); 
   opacity: 1;}
.icon-btn.primary { background: rgba(0,0,0,.12); }

/* leading: chevron/icon overlay */
.leading {
  width: 22px;
  height: 22px;
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-right: 6px;
  flex: 0 0 auto;
  border-radius: 6px;
}

.leading .chevron,
.leading .page-icon {
  position: absolute;
  inset: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: opacity 120ms ease;
  color:var(--text-secondary)
}

.leading .chevron.active {
  color:var(--text-main)
} 

.leading .page-icon.active {
  color:var(--text-main)
}

.leading .chevron { font-size: 14px; line-height: 1; }

.page-icon :deep(svg) { display: block; }

.leading .chevron { visibility: hidden; opacity: 0; }
.leading .page-icon { visibility: visible; opacity: 1; }

.page-item:hover .leading.has-children .chevron { visibility: visible; opacity: 0.65; }
.page-item:hover .leading.has-children .page-icon { visibility: hidden; opacity: 0; }

.page-item .leading.has-children.expanded .chevron { visibility: visible; opacity: 1; }
.page-item .leading.has-children.expanded .page-icon { visibility: hidden; opacity: 0; }

.page-item.moved-flash {
  position: relative;
  outline: 2px solid rgba(35, 131, 226, 0.55);
  background: rgba(35, 131, 226, 0.10);
  animation: movedPulse 900ms ease-out;
}

@keyframes movedPulse {
  0%   { transform: scale(1);   }
  35%  { transform: scale(1.01);}
  100% { transform: scale(1);   }
}
</style>
