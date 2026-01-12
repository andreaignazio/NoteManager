<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import usePagesStore from '@/stores/pages'

const pagesStore = usePagesStore()

const props = defineProps({
  open: { type: Boolean, default: false },
  anchorRect: { type: Object, default: null }, // {top,left,right,bottom,width,height}
  pageId: { type: [String, Number], default: null },
  // usiamo pageId + store come source of truth
})

const emit = defineEmits(['close'])

const popEl = ref(null)
const iconEl = ref(null)
const titleEl = ref(null)

const page = computed(() => {
  if (!props.pageId) return null
  return pagesStore.pagesById?.[String(props.pageId)] ?? null
})

const draftIcon = ref('')
const draftTitle = ref('')

let originalIcon = ''
let originalTitle = ''

function resetDraftFromPage() {
  const p = page.value
  originalIcon = (p?.icon ?? '') || ''
  originalTitle = (p?.title ?? '') || ''
  draftIcon.value = originalIcon
  draftTitle.value = originalTitle
}

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    resetDraftFromPage()
    await nextTick()
    // focus titolo di default
    titleEl.value?.focus?.()
    titleEl.value?.select?.()
  },
  { immediate: true }
)

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

const popStyle = computed(() => {
  const r = props.anchorRect
  //console.log(r)
  if (!r) return { display: 'none' }

  // dimensioni popover (usate per clamp)
  const W = 320
  const H = 64
  const PAD = 8

  let left = r.left
  let top = r.bottom + 8

  // clamp nel viewport
  const maxLeft = window.innerWidth - W - PAD
  const maxTop = window.innerHeight - H - PAD
  left = clamp(left, PAD, Math.max(PAD, maxLeft))
  top = clamp(top, PAD, Math.max(PAD, maxTop))

  /*return {
    position: 'fixed',
    left: `${left}px`,
    top: `${top}px`,
    width: `${W}px`,
    zIndex: 2000,
  }*/
  //left=0
 console.log("LEFT:", left, "TOP:", top)

 return {
    position: 'absolute',
    left: `${left}px`,
    top: `${top}px`,
    width: `${W}px`,
    zIndex: 2000,
  }
})

function close() {
  emit('close')
}

function cancel() {
  draftIcon.value = originalIcon
  draftTitle.value = originalTitle
  close()
}

async function commit() {
  const p = page.value
  if (!p) return close()

  // Normalizzazione (semplice)
  const icon = (draftIcon.value ?? '').trim()
  const titleRaw = (draftTitle.value ?? '').trim()
  const title = titleRaw.length ? titleRaw : 'Untitled'

  // Se nulla cambia: chiudi e basta
  const prevIcon = (p.icon ?? '') || ''
  const prevTitle = (p.title ?? '') || ''
  if (icon === prevIcon && title === prevTitle) {
    close()
    return
  }

  // optimistic
  p.icon = icon
  p.title = title

  try {
    await pagesStore.patchPage(p.id, { icon, title })
  } finally {
    close()
  }
}

function onKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault()
    commit()
    return
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    cancel()
  }
}

// click-outside: chiude (cancel)
function onGlobalPointerDown(e) {
  if (!props.open) return
  const t = e.target
  const inside = popEl.value && popEl.value.contains(t)
  if (inside) return
  cancel()
}
function onGlobalMouseMove(e){
  console.log("X:", e.clientX, "Y:", e.clientY)
}

onMounted(() => {
  window.addEventListener('pointerdown', onGlobalPointerDown, true)
  //window.addEventListener('mousemove', onGlobalMouseMove,)
})
onUnmounted(() => {
  window.removeEventListener('pointerdown', onGlobalPointerDown, true)
})

// icon input: limita a pochi char (emoji)
function onIconInput(e) {
  let v = e.target.value ?? ''
  // tieni massimo 4 code units (emoji composte restano ok abbastanza)
  if (v.length > 4) v = v.slice(0, 4)
  draftIcon.value = v
}
</script>

<template>
  <div v-if="open && page" class="popover" :style="popStyle" ref="popEl" @keydown="onKeydown">
    <div class="row">
      <input
        ref="iconEl"
        class="icon-input"
        :value="draftIcon"
        inputmode="text"
        autocomplete="off"
        spellcheck="false"
        placeholder="😀"
        @input="onIconInput"
      />

      <input
        ref="titleEl"
        class="title-input"
        :value="draftTitle"
        autocomplete="off"
        spellcheck="false"
        placeholder="Untitled"
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

.icon-input {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid rgba(0,0,0,.10);
  background: rgba(0,0,0,.02);
  text-align: center;
  font-size: 18px;
  line-height: 1;
  outline: none;
}

.icon-input:focus {
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