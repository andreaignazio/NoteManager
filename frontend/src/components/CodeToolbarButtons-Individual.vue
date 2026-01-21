<script setup>
import { ref, defineExpose } from 'vue'

const props = defineProps({
  // controlli visibilità/label dal parent
  isCode: { type: Boolean, default: false },
  languageLabel: { type: String, default: 'plaintext' },
  wrapOn: { type: Boolean, default: true },
})

const emit = defineEmits(['dots', 'lang', 'wrap'])

const dotsEl = ref(null)
const langEl = ref(null)
const wrapEl = ref(null)

defineExpose({
  getDotsEl: () => dotsEl.value,
  getLangEl: () => langEl.value,
  getWrapEl: () => wrapEl.value,
})
</script>

<template>
  <div class="toolbar">
    <!-- se vuoi: wrap/lang solo se code -->
    <button
      v-if="isCode"
      ref="wrapEl"
      class="pill icon"
      type="button"
      :title="wrapOn ? 'Wrap: ON' : 'Wrap: OFF'"
      @click.stop="emit('wrap')"
    >
      {{ wrapOn ? '↩︎' : '↔︎' }}
    </button>

    <button
      v-if="isCode"
      ref="langEl"
      class="pill lang"
      type="button"
      @click.stop="emit('lang')"
    >
      {{ languageLabel }}
      <span class="caret">▾</span>
    </button>

    <button
      ref="dotsEl"
      class="dots"
      type="button"
      @click.stop="emit('dots')"
      title="Menu"
    >
      ⋯
    </button>
  </div>
</template>

<style scoped>
.toolbar{
  position: absolute;
  top: var(--code-toolbar-top);
  right: 0;
  display: inline-flex;
  gap: 6px;
  align-items: center;

  opacity: 0;
  pointer-events: none;
  transition: opacity 120ms ease;
}

:host(.always-on) .toolbar { /* se mai ti serve */
  opacity: 1;
  pointer-events: auto;
}

.block-item:hover .toolbar,
.block-item:focus-within .toolbar{
  opacity: 1;
  pointer-events: auto;
}

.pill{
  height: var(--block-row-btn);
  border-radius: var(--bar-radius);
  border: 0;
  background: rgba(0,0,0,.03);
  cursor: pointer;
  color: rgba(0,0,0,.70);
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.pill.icon{
  width: var(--block-row-btn);
  justify-content: center;
  padding: 0;
}

.pill.lang{
  padding: 0 10px;
}

.caret{
  opacity: .6;
  font-size: 11px;
  transform: translateY(-1px);
}

.pill:hover{
  background: rgba(0,0,0,.06);
  color: rgba(0,0,0,.85);
}

.dots{
  width: var(--block-row-btn);
  height: var(--block-row-btn);
  border-radius: 8px;
  border: 0;
  background: transparent;
  cursor: pointer;
  opacity: 0.9;
}

.dots:hover{
  background: rgba(0,0,0,.06);
  color: rgba(0,0,0,.85);
}
</style>
