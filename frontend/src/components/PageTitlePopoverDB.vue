<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { getIconComponent } from '@/icons/catalog'

const props = defineProps({
  open: { type: Boolean, default: false },
  initialIcon: { type: String, default: '' }, // qui ora: "lucide:file"
  initialTitle: { type: String, default: '' },
  placeholderTitle: { type: String, default: 'Untitled' },
})

const emit = defineEmits(['commit', 'cancel', 'openIconPicker'])

const iconEl = ref(null)   // anchor
const titleEl = ref(null)

const draftIcon = ref('')
const draftTitle = ref('')



watch(
  () => props.open,
  async (open) => {
    if (!open) return
    draftIcon.value = (props.initialIcon ?? '') || ''
    draftTitle.value = (props.initialTitle ?? '') || ''
    await nextTick()
    titleEl.value?.focus?.()
    titleEl.value?.select?.()
  },
  { immediate: true }
)

function setDraftIcon(icon) {
  // lucide key intera, niente slice
  draftIcon.value = (icon ?? '').trim()
}

const DraftIconComp = computed(() => getIconComponent(draftIcon.value))

function onIconClick() {
  emit('openIconPicker')
}

function doCommit() {
  const icon = (draftIcon.value ?? '').trim()
  const titleRaw = (draftTitle.value ?? '').trim()
  const title = titleRaw.length ? titleRaw : props.placeholderTitle
  emit('commit', { icon, title })
}

function doCancel() {
  emit('cancel')
}

function onKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault()
    doCommit()
    return
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    doCancel()
  }
}

function focusTitle() {
  nextTick(() => {
    titleEl.value?.focus()
    
    const el = titleEl.value
    el?.setSelectionRange?.(el.value.length, el.value.length)
  })
}

defineExpose({
  iconAnchorEl: iconEl, 
  setDraftIcon,
  focusTitle
})
</script>

<template>
  <div class="popover" @keydown="onKeydown">
    <div class="row">
      <button
        ref="iconEl"
        class="icon-btn"
        type="button"
        @click.stop="onIconClick"
        aria-label="Pick icon"
      >
        <component :is="DraftIconComp" :size="18" />
      </button>

      <input
        ref="titleEl"
        class="title-input"
        :value="draftTitle"
        autocomplete="off"
        spellcheck="false"
        :placeholder="placeholderTitle"
        @input="draftTitle = $event.target.value"
      />
    </div>

    <div class="hint">Enter to save · Esc to cancel</div>
  </div>
</template>

<style scoped>

.popover {
  border-radius: 12px;
  border: 0px solid rgba(0,0,0,.10);
  background: transparent;
 /* box-shadow: 0 10px 30px rgba(0,0,0,.10);*/
  backdrop-filter: blur(8px);
  padding: 10px;
  position: relative;
  
}

.row {
  position: relative;
  display: grid;
  grid-template-columns: 34px 1fr;
  gap: 10px;
  align-items: center;
}

.icon-btn {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 0px solid var(--border-menu);
  background: var(--bg-icon-dark);
  display: flex;
  align-items: center;
  justify-content: center;
  outline: none;
  cursor: pointer;
  padding: 0;
  color: var(--text-secondary);
}

.icon-btn:hover { background: var(--bg-icon-dark-hover); }
.icon-btn:focus {
  border-color: var(--border-menu);
  background: var(--bg-icon-dark-hover);
}

.title-input {
  height: 34px;
  border-radius: 10px;
  border: 1px solid var(--border-menu );
  background: var(--bg-input);
  padding: 0 10px;
  font-size: 13px;
  font-weight: 650;
  color: var(--text-main);
  outline: none;
}

.title-input:focus {
  border-color: var(--border-menu-focus);
  background: var(--bg-input-focus);
}

.hint {
  margin-top: 8px;
  font-size: 11px;
  color: var(--text-secondary);

  user-select: none;
}
</style>
