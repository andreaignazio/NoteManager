<script setup>
import { nextTick, ref, watch, computed, onMounted, onBeforeUnmount } from 'vue'
import { useBlocksStore } from '@/stores/blocks'
import { storeToRefs } from 'pinia'
import { useAutoResizeTextarea, createTextareaAutoResizer } from '@/composables/useAutoResizeTextarea'
import BlockIconMenuController from '@/components/BlockIconMenuController.vue'
import CodeMirrorEditor from '@/codemirror/CodeMirrorEditor.vue'
import BlockTextSurface from '@/components/texteditors/BlockTextSurface.vue'
import BlockGutterSurface from '@/components/texteditors/BlockGutterSurface.vue'
import { getIconComponent } from '@/icons/catalog'
import BlockCalloutSurface from '@/components/texteditors/BlockCalloutSurface.vue'

import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'

import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'

import {useBlockFocus} from '@/composables/block/useBlockFocus'
import {useBlockSplit } from '@/composables/block/useBlockSplit'

import {useBlockPlaceholder} from '@/composables/block/useBlockPlaceholder'
import {useBlockPersistence} from '@/composables/block/useBlockPersistence'
import { useFocusRequestRouter } from '@/composables/block/useFocusRequestRouter'


const blocksStore = useBlocksStore()

const props = defineProps({
  block: Object,
  pageId: String,
  lastEmptyRootId: { type: [String, Number, null], default: null },
  registerEditor: { type: Function, default: null },
})


const localTextContent = ref(props.block.content?.text ?? "")
const typeClass = ref(props.block.type)
const errorMsg = ref("")

const {isFocused, hasAnyFocus, onFocus, onBlur} = useBlockFocus(props.block.id)

const {saveRich, saveCode } = useBlockPersistence(props.block.id, {delay:500})

//===DOM===
const textEditorRef = ref(null)
const inputEl = ref(null)

const initialContent = props.block.content?.json 
  // Caso 1: Abbiamo già il JSON (nuovo formato)
  ? props.block.content.json 
  // Caso 2: Abbiamo HTML (se hai fatto prove intermedie) o Testo (vecchio formato)
  : props.block.content?.text 
    ? `<p>${props.block.content.text}</p>` // Converti vecchio testo in paragrafo HTML base
    : { type: 'doc', content: [{ type: 'paragraph' }] } // Caso 3: Blocco vuoto nuovo

const editor = useEditor({
  content: initialContent,
  extensions: [
    StarterKit.configure({
      history: true,
      heading: false,
      bulletList: false,
      orderedList: false,
      blockquote: false,
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
    }),
    Underline, // se lo vuoi
    Placeholder.configure({
      placeholder: () => placeholderText.value,
      showOnlyWhenEditable: true,
      showOnlyCurrent: true,
    }),
    Highlight.configure({ multicolor: true }),
  ],
  editorProps: {
    attributes: {
      class: 'tiptap-editor-content',
      'data-block-editor': 'true',
      'data-block-id': props.block.id,
    },
    handleKeyDown: (view, event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        onKeydown(event)
        return true
      }
      if (event.key === 'Tab') {
        onKeydown(event)
        return true
      }
      return false
    },
  },
  onCreate: ({ editor }) => {
    syncTiptapText(editor)
  },
  onUpdate: ({ editor }) => {
    syncTiptapText(editor)
    saveRich(editor.getJSON(),editor.getText())
    
  },
  onFocus,
  onBlur,
})

const { tiptapText, syncTiptapText, isEmpty, placeholderText, showPlaceholder } = useBlockPlaceholder({
      typeClass,
      editor,
      localTextContent,
      isFocused,
      })

const {handleSplitAndCreate} = useBlockSplit(editor, props.pageId,props.block.id)

//===Focus request on blocks===
useFocusRequestRouter({
  getBlockId: () => props.block.id,
  getIsCode: () => isCode.value,
  getTiptapEditor: () => editor.value,
  getCodeEditorRef: () => codeEditorRef.value,
  getFallbackTextRef: () => textEditorRef.value,
})

//=== LIST BLOCKS ===
const olNumber = computed(() => blocksStore.getOlNumber(props.pageId, props.block.id))


//=== CODE BLOCKS ===
const codeEditorRef = ref(null)
const isCode = computed(() => props.block.type === 'code')

const localLanguage = ref(props.block.content?.language ?? "plaintext")
const localWrap = ref(props.block.content?.wrap ?? true)

watch(() => props.block.content?.wrap, (v) => {
  localWrap.value = (v ?? true)
})

//=== BLOCK TYPE CHECKS ===

const calloutIconId = computed(() => props.block.props?.iconId ?? null)
const CalloutIcon = computed(() => {
  if (!calloutIconId.value) return null
  return getIconComponent(calloutIconId.value)
})

//=== CALLOUT ICONS refs ===
const calloutIconBtn = ref(null)
const iconMenuRef = ref(null)

//=== CALLOUT ICON PICKER ===
function handleIconOpen() {
  console.log("handleIconOpen", calloutIconBtn.value)

  iconMenuRef.value?.openIconPicker?.()
}

function onSelectIcon(selectedIconId) {
  console.log("onSelectIcon", selectedIconId)
  blocksStore.updateBlockIcon(props.block.id, selectedIconId)
}


//=== TODO BLOCKS ===
const isTodo = computed(() => props.block.type === 'todo')
const localChecked = ref(!!props.block.content?.checked)

watch(() => props.block.content?.checked, (v) => {
  localChecked.value = !!v
})

//=== TODO CHECKBOX TOGGLE ===
async function toggleTodoChecked(e) {
  e?.stopPropagation?.()
  const next = !localChecked.value
  localChecked.value = next

  try {
    await blocksStore.updateBlockContent(props.block.id, { checked: next })
  } catch (err) {
    // rollback locale se fallisce
    localChecked.value = !!props.block.content?.checked
    throw err
  }
}

//===BLOCK GUTTER KIND ===
const isCallout = computed(() => props.block.type === 'callout')

const gutterKind = computed(() => {
  if (isTodo.value) return 'todo'
  if (typeClass.value === 'ul') return 'ul'
  if (typeClass.value === 'ol') return 'ol'
  return null
})
const isGutter = computed(() => gutterKind.value != null)

//=== KEYBOARD HANDLERS ===

async function onKeydown(e) {
  // TEXT BLOCKS: Enter split
  if (!isCode.value && e.key === 'Enter') {
    e.preventDefault()
    await handleSplitAndCreate()
    return
  }

  // CODE BLOCKS:
  // - Enter normale: newline (lascia fare al textarea)
  // - Ctrl/Cmd+Enter: split & nuovo blocco
  if (isCode.value && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    await handleSplitAndCreate()
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
    const caret = editor.value?.state?.selection?.from ?? (e.target?.selectionStart ?? 0)
    try {
      if (e.shiftKey) await blocksStore.outdentBlock(props.pageId, props.block.id)
      else await blocksStore.indentBlock(props.pageId, props.block.id)
      blocksStore.requestFocus(props.block.id, caret)
    } catch {
      errorMsg.value = "Error modifying blocks hierarchy"
    }
  }
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

//=== TEXTAREA AUTO-RESIZE ===
function onInputEl(el) {
  if (!el) return
  nextTick(() => {
    ar.attach(el, wrapEl.value || el)
    ar.resize()
  })
}

const { resize } = useAutoResizeTextarea(inputEl)
onMounted(() => nextTick(resize))


// watchers

const wrapEl = ref(null) // opzionale: wrapper che cambia width
const ar = createTextareaAutoResizer()

watch(
  () => inputEl.value,
  async (el) => {
    if (!el) return

    await nextTick()
    ar.attach(el, wrapEl.value || el) 
    ar.resize()
  },
  { immediate: true }
)


onBeforeUnmount(() => ar.detach())


watch(() => props.block.content?.text, async (newText) => {
  localTextContent.value = newText ?? ""
  
   await nextTick()
  resize()

})

watch(() => props.block.content?.language, (newLang) => {
  localLanguage.value = newLang ?? "plaintext"
})

watch(() => props.block.type, (newType) => {
  typeClass.value = newType
})


// come per il titolo: se è vuoto, NON mettere niente nel value (placeholder UI-only)
const displayValue = computed(() => (isEmpty.value ? '' : localTextContent.value))

//--- utility caret functions ---
function caretEndTextarea(el) {
  const len = (el?.value ?? '').length
  try { el.setSelectionRange(len, len) } catch {}
}

function caretAt(el, caret) {
  if (!el) return

  // caret = -1 => end
  if (caret === -1) {
    caretEndTextarea(el)
    return
  }

  if (typeof caret === 'number') {
    try { el.setSelectionRange(caret, caret) } catch {}
  }
}

function focusCodeEnd() {
  blocksStore.requestFocus(props.block.id, -1)
}





watch(() => props.block.content?.json, (newJson) => {
  // 1. Safety checks
  if (!editor.value || !newJson) return
  const currentJson = editor.value.getJSON()
  const isSame = JSON.stringify(newJson) === JSON.stringify(currentJson)

  if (!isSame) {

    editor.value.commands.setContent(newJson, { emitUpdate: false })
  }
}, { flush: 'post' })




watch(
  () => editor.value,
  (ed) => {
    props.registerEditor?.(props.block.id, ed || null)
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  props.registerEditor?.(props.block.id, null)
})


</script>


<template>
  <div ref="wrapEl" class="wrap" :class="{ 'is-code': isCode, 'is-callout': isCallout, 'is-focused': isFocused }">

    <!-- 3) CODE -->
    <div v-if="isCode">
    
      <div class="code-surface"
        @pointerdown.self.prevent="focusCodeEnd"
        @dragover.prevent
        @drop.prevent.stop="onNativeDropBlocked"
      >
        <div v-if="showPlaceholder" class="code-placeholder">
          {{ placeholderText }}
        </div>

        <CodeMirrorEditor
        class="codeWrapper"
          ref="codeEditorRef"
          v-model="localTextContent"
          :language="localLanguage"
          :wrap="localWrap"
          :auto-height="false"
          data-block-editor="true"
          :data-block-id="block.id"
          @focus="onFocus"
          @blur="onBlur"
          @keydown="onKeydown"
          @update:modelValue="(v) => {
                    localTextContent = v
                    ar.resize()
                    saveCode({ text: v, language: localLanguage, wrap: localWrap })
                  }"

        />
      </div>
    </div>

    <BlockCalloutSurface
      v-else-if="isCallout"
      ref="textEditorRef"
      v-model="localTextContent"
      :CalloutIcon="CalloutIcon"
      :showPlaceholder="showPlaceholder"
      :placeholderText="placeholderText"
      :autoResize="() => ar.resize()"
      @input-el="onInputEl"
      @focus="onFocus"
      @blur="onBlur"
      @keydown="onKeydown"
      @open-icon="handleIconOpen"
    />
    <!-- 2) GUTTER BLOCKS -->
    <BlockGutterSurface
      v-else-if="isGutter"
      ref="textEditorRef"
      :kind="gutterKind"
      :olNumber="olNumber"
      :checked="localChecked"
      @toggle-todo="toggleTodoChecked"
      @open-callout-icon="handleIconOpen"
    >
      <editor-content :editor="editor" />
    </BlockGutterSurface>

    <!-- 1) TEXT BLOCKS -->
    <div v-else class="tiptap-wrapper" :class="typeClass">
      <editor-content :editor="editor" />
    </div>
  </div>

  <BlockIconMenuController
    ref="iconMenuRef"
    :pageId="pageId"
    :blockId="block.id"
    :anchorEl="textEditorRef?.getCalloutBtn?.() ?? null"
    anchorLocation="blockRow"
    placement="bottom-end"
    :lockScrollOnOpen="false"
    @commit="onSelectIcon"
  />

  

 
</template>



<style scoped>

:deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  float: left;
  pointer-events: none;
  height: 0;
  opacity: 1;
  color:var(--text-muted);
}

/* opzionale: solo quando il blocco è focused */
.wrap:not(.is-focused) :deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: '';
}


  /* globale o :deep in scoped dove serve */
:deep(.tippy-box) {
   pointer-events: auto; 
    background: white;
  border: 1px solid rgba(0,0,0,.08);
  box-shadow: 0 12px 30px rgba(0,0,0,.12);
  border-radius: 12px;
  
  }
:deep(.tippy-content) { padding: 0 !important; }
  .code-wrapper {
    min-width: 0;
  }

  .ProseMirror {
    outline: none;
    padding: 0;
    margin: 0;
    line-height: 1.4;
  }
  :deep(.ProseMirror p) {
    margin: 0; /* Importante per l'allineamento */
    line-height: inherit;
  }
  :deep(.ProseMirror > *) {
    margin: 0;
  }
 :deep(.ProseMirror strong) { font-weight: 700; }
:deep(.ProseMirror em) { font-style: italic; }
:deep(.ProseMirror s) { text-decoration: line-through; }

:deep(.ProseMirror a) {
  text-decoration: underline;
  cursor: pointer;
}

:deep(.ProseMirror code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 0.95em;
  padding: 0.08em 0.25em;
  border-radius: 6px;
  background: rgba(0,0,0,.06);
}

  :deep(.tiptap-wrapper),
  :deep(.tiptap-editor-content) {
    position: relative;
    padding-top: 0;
    padding-bottom: 0;
    margin-top: 0;
    margin-bottom: 0;
    cursor: text;
    width: 100%;
  }

  :deep(.tiptap-editor-content),
  :deep(.ProseMirror) {
    width: 100%;
    min-width: 0;
    white-space: pre-wrap;
    word-break: break-word;
    overflow-wrap: anywhere;
    cursor: text;
  }

  :deep(.tiptap-wrapper .ProseMirror) {
    transform: translateY(1px);
  }

  :deep(.tiptap-editor-content:focus),
  :deep(.tiptap-editor-content:focus-visible),
  :deep(.ProseMirror:focus),
  :deep(.ProseMirror:focus-visible) {
    outline: none;
  }

  :deep(.bubble-menu) {
    z-index: 99999;
  }
 
.code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  line-height: 1.6em;
 background: transparent;
 
}

.wrap.is-code .code-surface {
  --code-pad-y: 10px;
  --code-pad-x: 8px;
  --code-font-size: 14px;
  --code-line-height: 1.6;
  display: flex;
  position: relative;
  padding: var(--code-pad-y) var(--code-pad-x);
  border-radius: 10px;
  background: transparent;
  overflow-x: scroll;
}

.code-placeholder {
  font-size: var(--code-font-size);
  line-height: var(--code-line-height);
}

.code-placeholder{
  position: absolute;
  left: var(--code-pad-x);
  top: var(--code-pad-y);

  opacity: .45;
  pointer-events: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  line-height: 1.6em;

  /* micro allineamento baseline (di solito serve 1-2px) */
  transform: translateY(-0px) translateX(5.8px);
}

  

.wrap {
  position: relative;
  display: inline-flex;
  width: 100%;
  font-size: 16px;
  padding-bottom: 0px;
  padding-top: 0px;
  
}

.input{
  display: block;
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  resize: none;
  font: inherit;
  padding: 0 0;
  line-height: 1.5em;
  overflow: hidden;
 color: inherit; 
 
}
.text-block{
  overflow: hidden;
}
.textarea.input.code {
  line-height: 1.6em; /* più stretto per code */
}
/*.p {font-size: 16px;}*/
.h1 { font-size: 28px; font-weight: 700; }
.h2 { font-size: 22px; font-weight: 650; }
.h3 { font-size: 18px; font-weight: 600; }
.quote { padding-left: 10px; border-left: 3px solid var(--quote-border); }
/*.ul {display: list-item; list-style-type: disc; margin-left: 20px; }
.ol { list-style-type: decimal; margin-left: 20px; }*/





</style>