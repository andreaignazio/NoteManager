<script setup>
import { ref, nextTick, watch } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  typeClass: { type: String, default: 'p' },
  showPlaceholder: { type: Boolean, default: false },
  placeholderText: { type: String, default: '' },
  autoResize: { type: Function, default: null }, // opzionale: ar.resize()
})

const emit = defineEmits(['update:modelValue', 'focus', 'blur', 'keydown', 'input-el'])

const inputEl = ref(null)

function onInput(e) {
  emit('update:modelValue', e.target.value ?? '')
  props.autoResize?.()
}

function focus() {
  inputEl.value?.focus?.()
}
function setCaret(caret) {
  const el = inputEl.value
  if (!el) return
  const len = (el.value ?? '').length
  const pos = caret === -1 ? len : Math.max(0, Math.min(len, caret ?? len))
  try { el.setSelectionRange(pos, pos) } catch {}
}

defineExpose({ focus, setCaret, getEl: () => inputEl.value })

watch(() => inputEl.value, async (el) => {
  if (!el) return
  await nextTick()
  emit('input-el', el) // per attach autoresize dal parent
}, { immediate: true })
</script>

<template>
  <div
    class="text-surface"
    v-animated-placeholder="{ show: showPlaceholder, text: placeholderText }"
  >
    <textarea
      ref="inputEl"
      class="input text-block"
      rows="1"
      :class="typeClass"
      :value="modelValue"
      data-block-editor="true"
      @focus="$emit('focus', $event)"
      @blur="$emit('blur', $event)"
      @keydown="$emit('keydown', $event)"
      @input="onInput"
    />
  </div>
</template>

<style scoped>
.input{
  display:block;
  width:100%;
  border:none;
  outline:none;
  background:transparent;
  resize:none;
  font:inherit;
  padding:0;
  line-height:1.5em;
  overflow:hidden;
  color:inherit;
}
.text-block{ overflow:hidden; }

.h1 { font-size: 28px; font-weight: 700; }
.h2 { font-size: 22px; font-weight: 650; }
.h3 { font-size: 18px; font-weight: 600; }
.quote { padding-left: 10px; border-left: 3px solid var(--quote-border); }
</style>
