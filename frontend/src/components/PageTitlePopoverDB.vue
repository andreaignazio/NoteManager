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
  border: 1px solid rgba(0,0,0,.10);
  background: rgba(255,255,255,.95);
  box-shadow: 0 10px 30px rgba(0,0,0,.10);
  backdrop-filter: blur(8px);
  padding: 10px;
}

.row {
  display: grid;
  grid-template-columns: 34px 1fr;
  gap: 10px;
  align-items: center;
}

.icon-btn {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid rgba(0,0,0,.10);
  background: rgba(0,0,0,.02);
  display: flex;
  align-items: center;
  justify-content: center;
  outline: none;
  cursor: pointer;
  padding: 0;
}

.icon-btn:hover { background: rgba(0,0,0,.04); }
.icon-btn:focus {
  border-color: rgba(0,0,0,.25);
  background: rgba(0,0,0,.03);
}

.title-input {
  height: 34px;
  border-radius: 10px;
  border: 1px solid rgba(0,0,0,.10);
  background: rgba(0,0,0,.02);
  padding: 0 10px;
  font-size: 13px;
  font-weight: 650;
  color: rgba(0,0,0,.80);
  outline: none;
}

.title-input:focus {
  border-color: rgba(0,0,0,.25);
  background: rgba(0,0,0,.03);
}

.hint {
  margin-top: 8px;
  font-size: 11px;
  color: rgba(0,0,0,.45);
  user-select: none;
}
</style>
