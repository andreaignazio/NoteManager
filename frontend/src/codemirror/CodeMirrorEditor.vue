<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { cmUiThemeFromVars, cmHighlightStyleFromVars } from '@/codemirror/theme'

import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { json } from '@codemirror/lang-json'
import { sql } from '@codemirror/lang-sql'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { markdown } from '@codemirror/lang-markdown'

const props = defineProps({
  modelValue: { type: String, default: '' },
  language: { type: String, default: 'plaintext' },
  wrap: { type: Boolean, default: true },
  autoHeight: { type: Boolean, default: true },
  readOnly: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'focus', 'blur', 'keydown'])

const host = ref(null)
let view = null

const langC = new Compartment()
const wrapC = new Compartment()
const roC = new Compartment()
const heightC = new Compartment()

function languageExt(lang) {
  const l = (lang || 'plaintext').toLowerCase()
  switch (l) {
    case 'javascript': return javascript()
    case 'typescript': return javascript({ typescript: true })
    case 'python': return python()
    case 'json': return json()
    case 'sql': return sql()
    case 'html': return html()
    case 'css': return css()
    case 'markdown': return markdown()
    default: return []
  }
}

function wrapExt(wrap) {
  if (wrap) return EditorView.lineWrapping

  // wrap = false → abilita scroll orizzontale
  return EditorView.theme({
    '.cm-scroller': {
      overflowX: 'auto',
      overflowY: props.autoHeight ? 'hidden' : 'auto',
    },
    '.cm-content': {
      whiteSpace: 'pre',
    },
  })
}

function roExt(ro) {
  return EditorView.editable.of(!ro)
}

// ✅ autoHeight “safe”: quando è ON togli scroll verticali e lasci crescere il contenitore
function heightExt(autoHeight) {
  if (!autoHeight) return []
  return EditorView.theme({
    '.cm-scroller': { overflowY: 'hidden' },
  })
}

const themeC = new Compartment()
let mo = null

function isDarkNow() {
  return document.documentElement.getAttribute('data-theme') === 'dark'
}

function themeExt() {
  return cmUiThemeFromVars(isDarkNow())
}

const highlight = cmHighlightStyleFromVars()


function baseTheme() {
  return EditorView.theme({
    /* editor root */
    '&.cm-editor': {
      outline: 'none',
      background: 'transparent',
    },

    /* focused editor */
    '&.cm-editor.cm-focused': {
      outline: 'none',
    },

    /* scroller interno */
    '.cm-scroller': {
      outline: 'none',
      overflow: 'auto',
    },

    /* fallback */
    '.cm-focused': {
      outline: 'none',
    },

    /* contenuto */
    '.cm-content': {
      padding: '0px',
      caretColor: 'currentColor',
    },
  })
}
let ro = null

function onExternalResize() {
  if (!view) return
  view.requestMeasure()
  requestAnimationFrame(syncAutoHeight)
}

// calcola altezza contenuto e applica al wrapper esterno
function syncAutoHeight() {
  if (!view || !props.autoHeight) return
  const scroller = view.dom.querySelector('.cm-scroller')
  if (!scroller) return

  // scrollHeight del content
  const h = scroller.scrollHeight
  // safety min/max (tweak)
  const min = 24
  const max = 800
  const clamped = Math.max(min, Math.min(max, h))
  host.value.style.height = `${clamped}px`
}

const blockNativeDrop = EditorView.domEventHandlers({
  dragover: (e) => {
    // impedisce il "drop caret" di CM
    e.preventDefault()
    return true
  },
  drop: (e) => {
    e.preventDefault()
    e.stopPropagation()
    return true
  },
})



function buildState() {
  return EditorState.create({
    doc: props.modelValue ?? '',
    extensions: [
      blockNativeDrop,
      history(),
      keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),

        themeC.of(themeExt()),
        syntaxHighlighting(highlight, { fallback: true }),


      // compartments
      langC.of(languageExt(props.language)),
      
      roC.of(roExt(props.readOnly)),
      heightC.of(heightExt(props.autoHeight)),
      wrapC.of(wrapExt(props.wrap)),

      // events -> parent
      EditorView.domEventHandlers({
        focus: () => emit('focus'),
        blur: () => emit('blur'),
        keydown: (e) => emit('keydown', e),
        mousedown: () => emit('focus'),
      }),

      // doc change -> v-model
      EditorView.updateListener.of((u) => {
        if (u.docChanged) {
          emit('update:modelValue', u.state.doc.toString())
        }
        if (props.autoHeight && (u.docChanged || u.viewportChanged)) {
          // dopo paint
          requestAnimationFrame(syncAutoHeight)
        }
      }),
    ],
  })
}

onMounted(() => {
  view = new EditorView({
    state: buildState(),
    parent: host.value,
  })
  ro = new ResizeObserver(() => onExternalResize())
  if (host.value) ro.observe(host.value)

  window.addEventListener('resize', onExternalResize)
  requestAnimationFrame(syncAutoHeight)

  mo = new MutationObserver(() => {
    if (!view) return
    view.dispatch({ effects: themeC.reconfigure(themeExt()) })
  })
  mo.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
})

})

onBeforeUnmount(() => {
  view?.destroy()
  view = null
  window.removeEventListener('resize', onExternalResize)
  ro?.disconnect()
  ro = null
  mo?.disconnect()
  mo = null
})

// modelValue -> editor
watch(
  () => props.modelValue,
  (val) => {
    if (!view) return
    const cur = view.state.doc.toString()
    const next = val ?? ''
    if (cur === next) return
    view.dispatch({ changes: { from: 0, to: cur.length, insert: next } })
    requestAnimationFrame(syncAutoHeight)
  }
)

// language/wrap/readonly/autoHeight reconfigure
watch(() => props.language, (l) => {
  if (!view) return
  view.dispatch({ effects: langC.reconfigure(languageExt(l)) })
})
watch(() => props.wrap, (w) => {
  if (!view) return
  view.dispatch({ effects: wrapC.reconfigure(wrapExt(w)) })
})
watch(() => props.readOnly, (ro) => {
  if (!view) return
  view.dispatch({ effects: roC.reconfigure(roExt(ro)) })
})
watch(() => props.autoHeight, (ah) => {
  if (!view) return
  view.dispatch({ effects: heightC.reconfigure(heightExt(ah)) })
  if (!ah) host.value.style.height = ''
  requestAnimationFrame(syncAutoHeight)
})

//===FOCUS/CARET API===

function focus() {
  view?.focus()
}

function setCursor(pos) {
  if (!view) return
  const p = Math.max(0, Math.min(pos ?? 0, view.state.doc.length))
  view.dispatch({ selection: { anchor: p, head: p } })
  view.focus()
}

function setCursorEnd() {
  if (!view) return
  const end = view.state.doc.length
  view.dispatch({ selection: { anchor: end, head: end } })
  view.focus()
}

defineExpose({ focus, setCursor, setCursorEnd })

</script>

<template>
  <div ref="host" class="cm-host" />
</template>

<style scoped>
.cm-host {
  width: 100%;
  overflow: auto;
  
  /* altezza gestita da JS quando autoHeight=true */
}
.cm-host :deep(.cm-editor),
.cm-host :deep(.cm-editor.cm-focused) {
  outline: none !important;
  overflow: scroll;
  max-width: 100%;
}
.cm-host :deep(.cm-scroller) {
  overflow-x: scroll;
  max-width: 100%;
}

.cm-host :deep(.cm-content),
.cm-host :deep(.cm-line) {
  max-width: 100%;
}
</style>
