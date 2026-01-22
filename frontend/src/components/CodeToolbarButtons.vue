<script setup>
import { ref, defineExpose } from 'vue'
import { anchorKey, anchorKind } from '@/ui/anchorsKeyBind'
import { useRegisterAnchors } from '@/composables/useRegisterAnchors';

const props = defineProps({
  // controlli visibilità/label dal parent
  blockId: { type: String, required: true },
  isCode: { type: Boolean, default: false },
  languageLabel: { type: String, default: 'plaintext' },
  wrapOn: { type: Boolean, default: true },
})

const emit = defineEmits(['dots', 'lang', 'wrap'])

const dotsEl = ref(null)
const langEl = ref(null)
const wrapEl = ref(null)



const dots_key = anchorKey(anchorKind(
  'block',
  'dots',
  'blockRow',
  'codeToolbar'
  ), props.blockId)

const lang_key = anchorKey(anchorKind(
  'block',
  'lang',
  'blockRow',
  'codeToolbar'
  ), props.blockId)

useRegisterAnchors({
  [dots_key]: dotsEl,
  [lang_key]: langEl,
})



defineExpose({
  getDotsEl: () => dotsEl.value,
  getLangEl: () => langEl.value,
  getWrapEl: () => wrapEl.value,
  dots_key,
  lang_key,
})
</script>

<template>
 <div class="toolbar">
  <div class="toolbar-group">
    <!-- Language -->
    <button
      v-if="isCode"
      ref="langEl"
      class="toolbar-segment lang"
      type="button"
      @click.stop="emit('lang')"
    >
      {{ languageLabel }}
      <span class="caret">▾</span>
    </button>

    <!-- Separator -->
    <div v-if="isCode" class="toolbar-separator"></div>

    <!-- Wrap -->
    <button
      v-if="isCode"
      ref="wrapEl"
      class="toolbar-segment icon"
      type="button"
      :title="wrapOn ? 'Wrap: ON' : 'Wrap: OFF'"
      @click.stop="emit('wrap')"
    >
      {{ wrapOn ? '↩︎' : '↔︎' }}
    </button>

    <!-- Dots -->
    <button
      ref="dotsEl"
      class="toolbar-segment icon"
      type="button"
      title="Menu"
      @click.stop="emit('dots')"
    >
      ⋯
    </button>
  </div>
</div>
</template>

<style scoped>
.toolbar {
  position: absolute;
  top: var(--code-toolbar-top);
  right: 0;

  opacity: 0;
  pointer-events: none;
  transition: opacity 120ms ease;
}

.block-item:hover .toolbar,
.block-item:focus-within .toolbar {
  opacity: 1;
  pointer-events: auto;
}

/* ===== GROUP (sfondo unico) ===== */
.toolbar-group {
  display: inline-flex;
  align-items: stretch;

  height: var(--block-row-btn);
  border-radius: 6px;
  background: var(--bg-icon-transp);
  box-shadow: inset 0 0 0 1px var(--border-main);

  overflow: hidden; /* IMPORTANT */
}

/* ===== SEGMENTS ===== */
.toolbar-segment {
  border: 0;
  background: transparent;
  cursor: pointer;

  display: inline-flex;
  align-items: center;
  justify-content: center;

  padding: 0 10px;
  font-size: 13px;
  color: var(--icon-secondary);

  transition: background 120ms ease, color 120ms ease;
}

.toolbar-segment.icon {
  width: var(--block-row-btn);
  padding: 0;
}

.toolbar-segment:hover {
  background: var(--bg-icon-hover);
  color: var(--icon-main);
}

/* ===== LANGUAGE ===== */
.toolbar-segment.lang {
  gap: 6px;
  font-weight: 500;
}

.caret {
  font-size: 11px;
  opacity: .6;
  transform: translateY(-1px);
}

/* ===== SEPARATOR (solo uno) ===== */
.toolbar-separator {
  width: 1px;
  background: var(--border-main);
  opacity: 0.6;
}

</style>
