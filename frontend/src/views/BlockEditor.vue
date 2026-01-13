<script setup>
import { nextTick, ref, watch, computed } from 'vue'
import { useBlocksStore } from '@/stores/blocks'
import { storeToRefs } from 'pinia'

const blocksStore = useBlocksStore()

const props = defineProps({
  block: Object,
  pageId: String
})

const errorMsg = ref("")

const localTextContent = ref(props.block.content?.text ?? "")
const localLanguage = ref(props.block.content?.language ?? "plaintext")

const typeClass = ref(props.block.type)

const { focusRequestId } = storeToRefs(blocksStore)
const inputEl = ref(null)

const isCode = computed(() => props.block.type === 'code')

// puoi allargarla quando vuoi (meglio allinearla al backend)
const CODE_LANG_OPTIONS = [
  { value: 'plaintext', label: 'Plain text' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'json', label: 'JSON' },
  { value: 'bash', label: 'Bash' },
  { value: 'sql', label: 'SQL' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'yaml', label: 'YAML' },
]

function onFocus() {
  blocksStore.setCurrentBlock(props.block.id)
}

async function onBlur() {
  await nextTick()
  const el = document.activeElement
  const isAnotherBlockEditor =
    el && el instanceof HTMLElement && el?.dataset?.blockEditor === 'true'
  if (!isAnotherBlockEditor) blocksStore.clearCurrentBlock()
}

async function handleSplitAndCreate(e){
  const el = e.target
  const text = e.target.value ?? ''
  const caret = typeof el.selectionStart === 'number' ? el.selectionStart : text.length

  const left = text.slice(0, caret)
  const right = text.slice(caret)

  // salva il blocco corrente (includi language se code)
  const leftContent = isCode.value
    ? { text: left, language: localLanguage.value }
    : { text: left }

  await blocksStore.updateBlockContent(props.block.id, leftContent)

  const newContent = isCode.value
    ? { text: right, language: localLanguage.value }
    : { text: right }

  const newId = await blocksStore.addNewBlock(
    props.pageId,
    { content: newContent, type: props.block.type },
    props.block.id
  )

  blocksStore.requestFocus(newId, 0)
}

// inserisce testo nel textarea mantenendo caret
function insertAtCaret(el, insertText) {
  const start = el.selectionStart ?? 0
  const end = el.selectionEnd ?? start
  const value = el.value ?? ""
  el.value = value.slice(0, start) + insertText + value.slice(end)
  const nextPos = start + insertText.length
  el.setSelectionRange?.(nextPos, nextPos)
  // trigger input per salvare
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

async function onKeydown(e) {
  // TEXT BLOCKS: Enter split
  if (!isCode.value && e.key === 'Enter') {
    e.preventDefault()
    await handleSplitAndCreate(e)
    return
  }

  // CODE BLOCKS:
  // - Enter normale: newline (lascia fare al textarea)
  // - Ctrl/Cmd+Enter: split & nuovo blocco
  if (isCode.value && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    await handleSplitAndCreate(e)
    return
  }

  // Tab behavior
  if (e.key === 'Tab') {
    if (isCode.value) {
      // Tab dentro code = indentazione (2 spazi, o \t se preferisci)
      e.preventDefault()
      const el = e.target
      insertAtCaret(el, e.shiftKey ? '' : '  ')
      return
    }

    // non-code: Tab = indent/outdent gerarchia
    e.preventDefault()
    const caret = e.target.selectionStart ?? 0
    try {
      if (e.shiftKey) await blocksStore.outdentBlock(props.pageId, props.block.id)
      else await blocksStore.indentBlock(props.pageId, props.block.id)
      blocksStore.requestFocus(props.block.id, caret)
    } catch {
      errorMsg.value = "Error modifying blocks hierarchy"
    }
  }
}

// Debounce save
let t = null
async function handleInput(inputEvent) {
  const newInput = inputEvent.target.value
  localTextContent.value = newInput

  const newContent = isCode.value
    ? { text: newInput, language: localLanguage.value }
    : { text: newInput }

  if (t) clearTimeout(t)
  t = setTimeout(async () => {
    try {
      await blocksStore.updateBlockContent(props.block.id, newContent)
    } catch {
      errorMsg.value = "Error saving local version"
    }
  }, 300)
}

// cambia linguaggio e salva (debounce separato, più “snappy”)
let tl = null
async function onLanguageChange() {
  if (!isCode.value) return

  if (tl) clearTimeout(tl)
  tl = setTimeout(async () => {
    try {
      await blocksStore.updateBlockContent(props.block.id, {
        text: localTextContent.value,
        language: localLanguage.value
      })
    } catch {
      errorMsg.value = "Error saving language"
    }
  }, 150)
}

// watchers
watch(() => props.block.content?.text, (newText) => {
  localTextContent.value = newText ?? ""
})

watch(() => props.block.content?.language, (newLang) => {
  localLanguage.value = newLang ?? "plaintext"
})

watch(() => props.block.type, (newType) => {
  typeClass.value = newType
})

watch(
  focusRequestId,
  async (req) => {
    if (!req || String(req.blockId) !== String(props.block.id)) return
    await nextTick()
    inputEl.value?.focus()
    if (typeof req.caret === 'number') {
      inputEl.value?.setSelectionRange?.(req.caret, req.caret)
    }
    blocksStore.clearFocusRequest()
  },
  { flush: 'post' }
)
</script>


<template>
  <div class="wrap" :class="{ 'is-code': isCode }">
    

    <input
      v-if="!isCode"
      ref="inputEl"
      class="input"
      :class="typeClass"
      :value="localTextContent"
      data-block-editor="true"
      :data-block-id="block.id"
      @focus="onFocus"
      @blur="onBlur"
      @keydown="onKeydown"
      @input="handleInput"
    />

    <textarea
      v-else
      ref="inputEl"
      class="input code"
      :class="typeClass"
      :value="localTextContent"
      data-block-editor="true"
      :data-block-id="block.id"
      @focus="onFocus"
      @blur="onBlur"
      @keydown="onKeydown"
      @input="handleInput"
    />
  </div>
</template>


<style scoped>
.wrap {
  width: 100%;
  
}

.input{
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  resize: none;
  font: inherit;
  padding: 0 0;
  line-height: 2em;
}
textarea.input.code {
  line-height: 1.6em; /* più stretto per code */
}
.h1 { font-size: 28px; font-weight: 700; }
.h2 { font-size: 22px; font-weight: 650; }
.h3 { font-size: 18px; font-weight: 600; }
.quote { padding-left: 10px; border-left: 3px solid rgba(0,0,0,0.25); }

.code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  line-height: 1.6em;
  /* niente background qui */
  background: transparent;
}

/* toolbar sopra il textarea */
.code-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 6px;
}

.lang {
  font: inherit;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid rgba(0,0,0,0.12);
  background: rgba(255,255,255,0.8);
}
</style>