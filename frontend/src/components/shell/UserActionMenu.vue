<script setup>
import { computed, ref, unref, nextTick } from 'vue'
import ActionMenuDB from '@/components/ActionMenuDB.vue'
import useLiveAnchorRect from '@/composables/useLiveAnchorRect'
import { useOverlayLayer } from '@/composables/useOverlayLayer'
import ThemeToggleButton from '@/components/buttons/ThemeToggleButton.vue'
import { useUiStore } from '@/stores/ui'
import { storeToRefs } from 'pinia'
const ui = useUiStore()

const props = defineProps({
  anchorEl: { type: [Object, null], default: null }, // HTMLElement | ref
  displayName: { type: String, default: '' },
  lockScrollOnOpen: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'logout', 'settings'])

const isOpen = ref(false)

const anchorResolved = computed(() => unref(props.anchorEl) ?? null)
const { anchorRect, scheduleUpdate } = useLiveAnchorRect(anchorResolved, isOpen)

// ref al componente ActionMenuDB (che espone .el)
const userMenuRef = ref(null)

const {mode: theme} = storeToRefs(ui)

// id univoco per evitare conflitti se SidebarHeader esiste 2 volte (docked + flyout)
const layerId = `userMenu:${Math.random().toString(36).slice(2)}`

function open() {
  isOpen.value = true
  nextTick(() => scheduleUpdate())
}
function close() {
  isOpen.value = false
  emit('close')
}
function toggle() {
  isOpen.value ? close() : open()
}

function handleToggleMode() {
  ui.toggleTheme()
} 

defineExpose({ open, close, toggle })

const { syncOpen } = useOverlayLayer(
  layerId,
  () => ({
    getMenuEl: () => userMenuRef.value?.el?.value ?? null, // ✅ HTMLElement
    getAnchorEl: () => anchorResolved.value,
    close: () => close(),
    options: {
      closeOnEsc: true,
      closeOnOutside: true,
      stopPointerOutside: true,
      lockScroll: !!props.lockScrollOnOpen,
      restoreFocus: true,
      allowAnchorClick: true,
    },
  })
)

syncOpen(isOpen)

const initial = computed(() => {
  const s = (props.displayName || '').trim()
  return s ? s[0].toUpperCase() : '?'
})
</script>

<template>
  <ActionMenuDB
    ref="userMenuRef"
    :open="isOpen"
    :anchorRect="anchorRect"
    :anchorEl="anchorEl"
    placement="right"
    custom
    :minWidth="260"
    :closeOnAction="false"
    @close="close"
  >
    <div>
      <div class="sec dark">
        <button class="identity" type="button" disabled>
          <span class="avatar">{{ initial }}</span>
          <span class="name" :title="displayName">{{ displayName || 'User' }}</span>
        </button>

      <div class="theme-toggle" >
        <ThemeToggleButton :theme="theme" @toggle="handleToggleMode" />
        </div>
        <!--<button class="icon-ghost" type="button" disabled title="Settings (soon)">
          ⚙︎
        </button>--> 
      </div>

      <div class="sep" aria-hidden="true"></div>

      <div class="sec">
        <button
          class="btn-ghost danger"
          type="button"
          @click="emit('logout'); close()"
        >
          Logout
        </button>
      </div>
    </div>
  </ActionMenuDB>
</template>

<style scoped>
/* sezioni interne al menu */

.theme-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
  margin-top: 4px;
  margin-bottom: 4px;
  border: 0px;
  
}
.sec {
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.sec.dark {
  background: rgba(0,0,0,.06);
  border-radius: 10px;
  margin: 2px;
}

.sep {
  height: 1px;
  margin: 6px 6px;
  background: rgba(0,0,0,.10);
}

/* identity row dentro al menu */
.identity {
  display: flex;
  align-items: center;
  gap: 10px;

  min-width: 0;
  border: 0;
  background: transparent;
  padding: 0;
  text-align: left;
  opacity: 1;
}

.avatar {
  width: 28px;
  height: 28px;
  border-radius: 9px;
  display: grid;
  place-items: center;

  background: rgba(255,255,255,.65);
  font-weight: 700;
  font-size: 13px;
}

.name {
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-main);  
}

/* logout full-width */
.btn-ghost {
  width: 100%;
  color: var(--text-main);
}
.btn-ghost:hover {
  color: var(--text-danger) !important;
  background:var(--bg-menu-danger)!important;

}
</style>