<script setup>
import { ref, nextTick, watch } from 'vue'

/**
 * PROPS
 */
const props = defineProps({
  modelValue: { type: String, default: '' },

  // callout icon
  CalloutIcon: { type: [Object, Function, null], default: null },

  // placeholder
  showPlaceholder: { type: Boolean, default: false },
  placeholderText: { type: String, default: '' },

  // optional autoresize callback (dal parent)
  autoResize: { type: Function, default: null },
})

/**
 * EMITS
 */
const emit = defineEmits([
  'update:modelValue',
  'focus',
  'blur',
  'keydown',
  'open-icon',
  'input-el',
])

/**
 * REFS
 */
const inputEl = ref(null)
const calloutBtnEl = ref(null)

/**
 * INPUT HANDLER
 */
function onInput(e) {
  emit('update:modelValue', e.target.value ?? '')
  props.autoResize?.()
}

/**
 * FOCUS / CARET API (per BlockRow)
 */
function focus() {
  inputEl.value?.focus?.()
}

function setCaret(caret) {
  const el = inputEl.value
  if (!el) return

  const len = (el.value ?? '').length
  const pos = caret === -1 ? len : Math.max(0, Math.min(len, caret ?? len))

  try {
    el.setSelectionRange(pos, pos)
  } catch {}
}

/**
 * EXPOSE
 * - focus / setCaret: per focusRequest
 * - getEl: textarea (autoresize)
 * - getCalloutBtn: anchor per icon menu
 */
defineExpose({
  focus,
  setCaret,
  getEl: () => inputEl.value,
  getCalloutBtn: () => calloutBtnEl.value,
})

/**
 * NOTIFY PARENT WHEN TEXTAREA IS READY
 * (per attach autoresize)
 */
watch(
  () => inputEl.value,
  async (el) => {
    if (!el) return
    await nextTick()
    emit('input-el', el)
  },
  { immediate: true }
)
</script>

<template>
  <div class="calloutWrap">
    <button
      ref="calloutBtnEl"
      class="calloutIconBtn"
      type="button"
      @click.stop="$emit('open-icon')"
      title="Change icon"
    >
      <component v-if="CalloutIcon" :is="CalloutIcon" :size="15" class="calloutIcon" />
      <span v-else class="calloutIconPlaceholder">+</span>
    </button>

    <div class="calloutContent"
         v-animated-placeholder="{ show: showPlaceholder, text: placeholderText }">
      <textarea
        ref="inputEl"
        class="input text-block calloutText"
        rows="1"
        :value="modelValue"
        data-block-editor="true"
        @focus="$emit('focus', $event)"
        @blur="$emit('blur', $event)"
        @keydown="$emit('keydown', $event)"
        @input="onInput"
      />
    </div>
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
.calloutWrap{
  display: grid;
  grid-template-columns: 38px 1fr;
  column-gap: 8px;
  align-items: center; /* ✅ qui ha senso */
  min-height: 48px;
  padding: 6px 8px;
  border-radius: 12px;
  background: transparent;
  transform: translateY(5px);
}
.calloutIconBtn{
  width: 38px; height: 38px;
  border-radius: 8px;
  border: 0;
  background: var(--bg-icon-transp);
  display: grid;
  place-items: center;
}
.calloutContent{ min-width: 0; }
.calloutText{ line-height: 1.5em; }
</style>
