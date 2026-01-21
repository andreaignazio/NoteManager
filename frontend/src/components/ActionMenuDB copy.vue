<script setup>
import { ref, watch, nextTick, onMounted, onBeforeUnmount, computed, unref } from 'vue'
import { getIconComponent } from '@/icons/catalog'

const props = defineProps({
  open: { type: Boolean, default: false },

  
  anchorRect: { type: Object, default: null }, // {top,left,right,bottom,width,height}


  anchorEl: { type: [Object, null], default: null }, // HTMLElement | ref

  
  items: { type: Array, default: () => [] },

  activeId: { type: String, default: null },

  minWidth: { type: Number, default: 220 },
  gap: { type: Number, default: 6 },
  viewportMargin: { type: Number, default: 25 },
  closeOnAction: { type: Boolean, default: true },
  sideOffsetX: { type: Number, default: 0 },
  custom: { type: Boolean, default: false },
  placement: { type: String, default: 'left' }, // 'right' | 'bottom-start' | 'bottom-end' | 'left'
  
  scroll: { type: [Boolean, String], default: 'auto' },
  maxHeight : { type: [Number, String, null], default: null },
  offsetY: { type: Number, default: 0 },
})

const emit = defineEmits(['action', 'close'])

const menuEl = ref(null)
const menuStyle = ref({ display: 'none' })

// Dimensioni misurate (stabili durante scroll)
const measuredW = ref(0)
const measuredH = ref(0)
const measured = ref(false)

const menuItems = ref([]) // array di button

function getItemElById(id) {
  const arr = menuItems.value ?? []
  return arr.find((btn) => btn?.dataset?.menuItemId === String(id)) ?? null
}

function getMenuEl() {
  return menuEl.value ?? null
}


defineExpose({ el: menuEl , menuItems, getItemElById, getMenuEl})

const anchorElResolved = computed(() => unref(props.anchorEl) ?? null)

function computePosition(anchorRect, menuW, menuH) {
  const margin = props.viewportMargin
  const offsetX = props.sideOffsetX ?? 0
  const gap = props.gap ?? 6

  let left = 0
  let top = 0
    if (props.placement === 'right-start') {
    left = anchorRect.right + gap + offsetX
    top = anchorRect.top
  } else if (props.placement === 'right-end') {
    left = anchorRect.right + gap + offsetX
    top = anchorRect.bottom - menuH
  } else if (props.placement === 'left-start') {
    left = anchorRect.left - menuW + offsetX
    top = anchorRect.top
  } else if (props.placement === 'left-end') {
    left = anchorRect.left - menuW + offsetX
    top = anchorRect.bottom - menuH
  } else if (props.placement === 'right') {
    left = anchorRect.right + gap + offsetX
    top = anchorRect.top
  } else if (props.placement === 'bottom-start') {
    left = anchorRect.left + offsetX
    top = anchorRect.bottom + gap
  } else if (props.placement === 'bottom-end') {
    left = anchorRect.right - menuW + offsetX
    top = anchorRect.bottom + gap
  } else {
   
    left = anchorRect.left - menuW + offsetX
    top = anchorRect.top + (anchorRect.height - menuH) / 2

    
    if (left < margin) left = anchorRect.right + gap + offsetX
  }

  // clamp verticale
  top = Math.min(top, window.innerHeight - menuH - margin)
  top = Math.max(top, margin)

  // clamp orizzontale
  left = Math.min(left, window.innerWidth - menuW - margin)
  left = Math.max(left, margin)

  return { top, left }
}

async function measureIfNeeded() {
  if (!props.open) return
  if (measured.value) return

  // rendilo misurabile ma invisibile 
  menuStyle.value = {
    position: 'fixed',
    top: '-9999px',
    left: '-9999px',
    zIndex: 2000,
    minWidth: `${props.minWidth}px`,
    visibility: 'hidden',
  }

  await nextTick()
  await new Promise(requestAnimationFrame)

  const el = menuEl.value
  measuredW.value = el?.offsetWidth ?? props.minWidth
  measuredH.value = el?.offsetHeight ?? 200
  measured.value = true
}

function updatePosition() {
  if (!props.open || !props.anchorRect) {
    menuStyle.value = { display: 'none' }
    return
  }

  const w = measuredW.value || props.minWidth
  const h = measuredH.value || 200

  const { top, left } = computePosition(props.anchorRect, w, h)

  menuStyle.value = {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
    zIndex: 2000,
    minWidth: `${props.minWidth}px`,
    visibility: 'visible',
  }
}

async function syncPosition() {
if (!props.anchorRect) {
    menuStyle.value = { display: 'none' }
    return
  }
  if (!props.open) {
    menuStyle.value = { display: 'none' }
    return
  }
  await measureIfNeeded()
  updatePosition()

}

function pick(item) {
  if (item.disabled) return
  emit('action', { id: item.id, payload: item.payload })
  if (props.closeOnAction) emit('close')
}


// Reset misura se cambia contenuto/parametri che impattano size
watch(
  () => [props.custom, props.minWidth, props.items],
  () => {
    measured.value = false
    measuredW.value = 0
    measuredH.value = 0
    if (props.open) syncPosition()
  },
  { deep: true }
)

// Quando cambia anchorRect o open → aggiorna posizione (senza offscreen loop)
watch(
  () => [props.open, props.anchorRect],
  () => syncPosition(),
  { deep: true }
)

const resolvedScroll = computed(() => {
  // auto: comportamento “sensato”
  if (props.scroll === 'auto') return props.custom ? false : true
  return !!props.scroll
})

const maxHeightStyle = computed(() => {
  // Se scroll è off → niente maxHeight
  if (!resolvedScroll.value) return { maxHeight: 'none', overflow: 'visible' }

  // scroll on → maxHeight custom o default
  const mh =
    props.maxHeight ??
    'min(360px, calc(100vh - 16px))'

  return {
    maxHeight: typeof mh === 'number' ? `${mh}px` : mh,
    overflow: 'auto',
  }
})


</script>

<template>
  <Transition name="menu-pop">
    <div
      
      v-if="open"
      ref="menuEl"
      class="menu"
      :class="{
        'scroll-on': resolvedScroll,
        'scroll-off': resolvedScroll === false,
      }"
      :style="[menuStyle, maxHeightStyle]"
      role="menu"
    >
      <template v-if="custom">
        <slot />
      </template>

      <ul v-else class="menuList">
        <template v-for="(it, idx) in items" :key="it.type === 'separator' ? `sep-${idx}` : it.id">
          <li v-if="it.type === 'separator'" class="separator" role="separator" aria-hidden="true"></li>

          <li v-else class="menuItem" >
            <button
              ref="menuItems"
              class="optionBtn"
              :data-menu-item-id="it.id"
              :class="{ active: it.id === activeId, danger: !!it.danger }"
              :disabled="!!it.disabled"
              type="button"
              role="menuitem"
              @click="pick(it)"
            >
              
              <span v-if="it.icon" class="optionIcon" aria-hidden="true">{{ it.icon }}</span>
              <span v-if="it.iconId">
               <component :is="getIconComponent(it.iconId)" :size="16" />
              </span>
              <span class="optionLabel">{{ it.label }}</span>
              <span v-if="it.submenu" class="optionChevron" aria-hidden="true">›</span>
            </button>
          </li>
        </template>
      </ul>
    </div>
  </Transition>
</template>

<style scoped>
.menu {
  background: var(--bg-menu);
  border: 1px solid var(--border-menu);
  border-radius: 12px;
  box-shadow: 0 12px 30px rgba(0,0,0,.14);
  padding: 6px;
  z-index:2000;
 /* max-height: min(360px, calc(100vh - 16px));
  overflow: auto;*/
}


.menuList { list-style: none; margin: 0; padding: 0; }
.menuItem { margin: 0; padding: 0; }

.separator {
  height: 1px;
  margin: 6px 6px;
  background: var(--border-menu);
}

.optionBtn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 0;
  background: transparent;
  border-radius: 10px;
  cursor: pointer;
  text-align: left;
  color: var(--text-main);
}

.optionBtn:hover { background: var(--bg-hover); }
.optionBtn:active { background: var(--bg-hover); }
.optionBtn.active { background: var(--bg-hover); }


.optionBtn.danger:hover { 
  background: var(--bg-menu-danger); 
  color: var(--text-danger);
}

.optionBtn:disabled { opacity: .45; cursor: not-allowed; }

.optionIcon { width: 22px; display: inline-flex; justify-content: center; }
.optionLabel { 
  font-size: 14px;
  line-height: 1.2; }

/* animazione */
.menu-pop-enter-active,
.menu-pop-leave-active {
  transition: opacity 120ms ease, transform 120ms ease;
}
.menu-pop-enter-from,
.menu-pop-leave-to {
  opacity: 0;
  transform: scale(0.98);
  transform-origin: top left;
}
.menu-pop-enter-to,
.menu-pop-leave-from {
  opacity: 1;
  transform: scale(1);
}
.optionChevron {
  margin-left: auto;
  opacity: .55;
}
.optionBtn:disabled .optionChevron { opacity: .35; }

.menu::-webkit-scrollbar {width:13px; }
.menu::-webkit-scrollbar-thumb {
background:rgba(0,0,0,.18);
border-radius:10px;
border:3px solid transparent;
background-clip: content-box;
}
.menu::-webkit-scrollbar-thumb:hover {background:rgba(0,0,0,.26); }
</style>