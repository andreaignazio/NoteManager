<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  editor: { type: Object, default: null },     // tiptap editor instance
  type: { type: String, required: true },      // props.block.type
})

const emit = defineEmits(['set-type'])         // emit('set-type', 'h1' | 'ul' | ...)

const canUseEditor = computed(() => !!props.editor)

// ---- inline formatting helpers ----
function cmd(fn) {
  if (!props.editor) return
  props.editor.chain().focus()[fn]().run()
}

function toggleBold() { cmd('toggleBold') }
function toggleItalic() { cmd('toggleItalic') }
function toggleStrike() { cmd('toggleStrike') }
function toggleCode() { cmd('toggleCode') }

function setLink() {
  if (!props.editor) return
  const prev = props.editor.getAttributes('link')?.href || ''
  const url = window.prompt('URL', prev)
  if (url === null) return
  if (url === '') props.editor.chain().focus().unsetLink().run()
  else props.editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
}

// ---- block type actions ----
function setType(next) {
  emit('set-type', next)
}

// UI state
const isBold = computed(() => props.editor?.isActive('bold') ?? false)
const isItalic = computed(() => props.editor?.isActive('italic') ?? false)
const isStrike = computed(() => props.editor?.isActive('strike') ?? false)
const isCode = computed(() => props.editor?.isActive('code') ?? false)
const isLink = computed(() => props.editor?.isActive('link') ?? false)

const is = (t) => computed(() => props.type === t)
</script>

<template>
  <div class="toolbar floating-toolbar">
    <!-- INLINE -->
    <div class="group" v-if="canUseEditor">
      <button class="btn" :class="{ active: isBold }" @mousedown.prevent @click="toggleBold">B</button>
      <button class="btn" :class="{ active: isItalic }" @mousedown.prevent @click="toggleItalic"><em>I</em></button>
      <button class="btn" :class="{ active: isStrike }" @mousedown.prevent @click="toggleStrike"><s>S</s></button>
      <button class="btn" :class="{ active: isCode }" @mousedown.prevent @click="toggleCode">{ }</button>
      <button class="btn" :class="{ active: isLink }" @mousedown.prevent @click="setLink">🔗</button>
    </div>

    <div class="sep" />

    <!-- BLOCK TYPE -->
    <div class="group">
      <button class="btn" :class="{ active: type==='p' }" @mousedown.prevent @click="setType('p')">T</button>
      <button class="btn" :class="{ active: type==='h1' }" @mousedown.prevent @click="setType('h1')">H1</button>
      <button class="btn" :class="{ active: type==='h2' }" @mousedown.prevent @click="setType('h2')">H2</button>
      <button class="btn" :class="{ active: type==='h3' }" @mousedown.prevent @click="setType('h3')">H3</button>
      <button class="btn" :class="{ active: type==='quote' }" @mousedown.prevent @click="setType('quote')">❝</button>
      <button class="btn" :class="{ active: type==='ul' }" @mousedown.prevent @click="setType('ul')">•</button>
      <button class="btn" :class="{ active: type==='ol' }" @mousedown.prevent @click="setType('ol')">1.</button>
      <button class="btn" :class="{ active: type==='todo' }" @mousedown.prevent @click="setType('todo')">☐</button>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 10px;
  background: var(--bg-toolbar);
  user-select: none;
  
  opacity: 1;
}
.group { display: inline-flex; gap: 6px; align-items: center; }
.sep { width: 1px; height: 18px; background: rgba(0,0,0,.12); }
.btn {
  border: none;
  background: transparent;
  border-radius: 8px;
  padding: 4px 6px;
  cursor: pointer;
  line-height: 1;
  color: var(--text-secondary);
}
.btn.active {
  color: var(--text-main);
  background: rgba(0,0,0,.12);
}
.btn:hover {
  background: var(--text-main);
  background: var(--bg-hover);
}
</style>
