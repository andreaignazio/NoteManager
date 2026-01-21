<script setup>
import { computed, ref, nextTick } from 'vue'
import useUIStore from '@/stores/ui'
import UserActionMenu from '@/components/shell/UserActionMenu.vue'

const uiStore = useUIStore()
const isDocked = computed(() => uiStore.sidebarMode === 'docked')

const props = defineProps({
  displayName: { type: String, default: '' },
})

const emit = defineEmits(['new-page', 'profile', 'logout', 'toggleTheme'])

//===USER ACTION MENU===

const identityEl = ref(null)
const userMenuOpen = ref(false)
const userAnchorRect = ref(null)
const userActionMenuRef = ref(null)

function openUserMenu() {
  const el = identityEl.value
  if (!el) return
  userActionMenuRef.value?.open?.()
  console.log("openuser")
}

function closeUserMenu() {
  userMenuOpen.value = false
}
const initial = computed(() => {
  const s = (props.displayName || '').trim()
  return s ? s[0].toUpperCase() : '?'
})

function closeDocked() {
  uiStore.sidebarMode = 'hidden'
}

const avatarRef = ref(null)
</script>

<template>
  <div class="sidebar-header">
    <button ref="identityEl" class="identity" type="button" @click="openUserMenu">
      <span ref = "avatarRef" class="avatar">{{ initial }}</span>
      <span class="name" :title="displayName">{{ displayName || 'User' }}</span>
    </button>
   
    <div class="actions">
      <button
      v-if="isDocked"
      class="icon-btn"
      type="button"
      aria-label="Close sidebar"
      title="Close sidebar"
      @click="closeDocked"
      >
      ‹
      </button>
      <button class="icon-btn" type="button" aria-label="New page" @click="$emit('new-page')">
          +
      </button>
    </div>
  </div>
  <UserActionMenu
  ref="userActionMenuRef"
  :anchorEl="avatarRef"
  :displayName="displayName"
  @toggleTheme="$emit('toggleTheme')"
  @logout="$emit('logout')"
/>

</template>

<style scoped>
.sidebar-header {
  height: var(--bar-h);
  padding: 0 var(--bar-px);
  gap: var(--bar-gap);
  display: flex;
  align-items: center;
  justify-content: space-between;
  

  
  border-radius: 12px;
  background: transparent;
}
.sidebar-header:hover{
  background: var(--bg-hover);
}

.identity {
  display: flex;
  align-items: center;
  gap: 10px;

  min-width: 0;
  border: 0;
  background: transparent;
  padding: 0;
  cursor: pointer;
  text-align: left;
}

:deep(.avatar) {
  width: 28px;
  height: 28px;
  border-radius: 9px;
  display: grid;
  place-items: center;

  background: var(--bg-icon-dark);
  font-weight: 700;
  font-size: 13px;
  color:var(--text-secondary);
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

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.icon-btn {
  height: var(--bar-btn);
  width: var(--bar-btn);
  border-radius: var(--bar-radius);
  padding: 0 10px;
  
  border: 0px solid rgba(0,0,0,.12);
  color:var(--icon-main);
  background: var(--bg-icon-transp);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}


</style>