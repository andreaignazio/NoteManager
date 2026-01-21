<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { Prec } from '@codemirror/state'
import { cmUiThemeFromVars } from '@/codemirror/theme' // riusa il tuo theme

const props = defineProps({
  modelValue: { type: String, default: '' },

  // styling variant: 'p' | 'h1' | 'h2' | 'h3' | 'quote'
  typeClass: { type: String, default: 'p' },

  // placeholder (mostralo solo se showPlaceholder=true)
  showPlaceholder: { type: Boolean, default: false },
  placeholderText: { type: String, default: '' },

  wrap: { type: Boolean, default: true },
  autoHeight: { type: Boolean, default: true },
  readOnly: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'focus', 'blur', 'keydown','split'])

const host = ref(null)
let view = null

// compartments
const wrapC = new Compartment()
const roC = new Compartment()
const heightC = new Compartment()
const themeC = new Compartment()
const phC = new Compartment()

let ro = null
let mo = null

function isDarkNow() {
  return document.documentElement.getAttribute('data-theme') === 'dark'
}
function themeExt() {
  return cmUiThemeFromVars(isDarkNow())
}

function wrapExt(wrap) {
  return wrap ? EditorView.lineWrapping : []
}
function roExt(readOnly) {
  return EditorView.editable.of(!readOnly)
}
function heightExt(autoHeight) {
  if (!autoHeight) return []
  return EditorView.theme({
    '.cm-scroller': { overflowY: 'hidden' },
  })
}

// placeholder dinamico (vuoto se non va mostrato)
function placeholderExt() {
  const show = props.showPlaceholder && ((props.modelValue ?? '').trim().length === 0)
  return show ? cmPlaceholder(props.placeholderText ?? '') : []
}

function baseTheme() {
  return EditorView.theme({
    '&.cm-editor': {
      outline: 'none',
      background: 'transparent',
    },
    '&.cm-editor.cm-focused': { outline: 'none' },

    '.cm-scroller': {
      outline: 'none',
      overflow: 'hidden',
    },

    '.cm-content': {
      padding: '0px',
      caretColor: 'currentColor',
      fontFamily: 'inherit',
      fontSize: 'inherit',
      lineHeight: '1.5em',
      color: 'inherit',
    },

    '.cm-line': { padding: '0px' },

    '.cm-placeholder': {
      opacity: '0.45',
    },
  })
}

function onExternalResize() {
  if (!view) return
  view.requestMeasure()
  requestAnimationFrame(syncAutoHeight)
}

let isSettingHeight = false

// calcola altezza contenuto e applica al wrapper esterno
function syncAutoHeight() {
  if (!view || !props.autoHeight || !host.value) return
  const scroller = view.dom.querySelector('.cm-scroller')
  if (!scroller) return

  const h = scroller.scrollHeight
  const min = 24
  const max = 800
  const clamped = Math.max(min, Math.min(max, h))

  // ✅ evita scritture inutili (altra fonte di flicker)
  const next = `${clamped}px`
  if (host.value.style.height === next) return

  isSettingHeight = true
  host.value.style.height = next
  // reset dopo paint
  requestAnimationFrame(() => { isSettingHeight = false })
}

// blocca native drop caret di CM (coerente col tuo code)
const blockNativeDrop = EditorView.domEventHandlers({
  dragover: (e) => {
    e.preventDefault()
    return true
  },
  drop: (e) => {
    e.preventDefault()
    e.stopPropagation()
    return true
  },
})

const enterSplitKeymap = Prec.highest(
  keymap.of([{
    key: 'Enter',
    run: () => {
      if (!view) return true
      const caret = view.state.selection.main.head
      emit('split', { caret })
      return true // blocca newline
    }
  }])
)

function buildState() {
  return EditorState.create({
    doc: props.modelValue ?? '',
    extensions: [
      
      blockNativeDrop,
      history(),
       enterSplitKeymap,
      keymap.of([...defaultKeymap, ...historyKeymap]),

      baseTheme(),
      themeC.of(themeExt()),

      // compartments
      wrapC.of(wrapExt(props.wrap)),
      roC.of(roExt(props.readOnly)),
      heightC.of(heightExt(props.autoHeight)),
      phC.of(placeholderExt()),

      // events -> parent
      EditorView.domEventHandlers({
        focus: () => emit('focus'),
        blur: () => emit('blur'),

        keydown: (e) => {
          // ✅ compatibilità BlockRow: Enter = split (no newline)
          if (e.key === 'Enter') {
            console.log("CM6-enterprevent")
            e.preventDefault()
            emit('keydown', e)
            return true // dice a CM: evento gestito, non fare altro
          }

          // per tutto il resto: inoltra e lascia che CM gestisca i suoi default
          emit('keydown', e)

          // se il parent ha chiamato preventDefault (es. Tab indent/outdent),
          // blocca la gestione interna di CM
          if (e.defaultPrevented) return true
          return false
        },

        mousedown: () => emit('focus'),
      }),

      // doc change -> v-model
      EditorView.updateListener.of((u) => {
        if (u.docChanged) {
          emit('update:modelValue', u.state.doc.toString())
        }
        if (props.autoHeight && (u.docChanged || u.viewportChanged)) {
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

  ro = new ResizeObserver(() => {
    if (isSettingHeight) return
    onExternalResize()
  })
  if (host.value) ro.observe(host.value)
  window.addEventListener('resize', onExternalResize)
  requestAnimationFrame(syncAutoHeight)

  // theme switch
  mo = new MutationObserver(() => {
    if (!view) return
    view.dispatch({ effects: themeC.reconfigure(themeExt()) })
  })
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
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

// wrap/readonly/autoHeight reconfigure
watch(() => props.wrap, (w) => {
  if (!view) return
  view.dispatch({ effects: wrapC.reconfigure(wrapExt(w)) })
})
watch(() => props.readOnly, (r) => {
  if (!view) return
  view.dispatch({ effects: roC.reconfigure(roExt(r)) })
})
watch(() => props.autoHeight, (ah) => {
  if (!view) return
  view.dispatch({ effects: heightC.reconfigure(heightExt(ah)) })
  if (!ah && host.value) host.value.style.height = ''
  requestAnimationFrame(syncAutoHeight)
})

// placeholder reconfigure quando cambia show/text/value
watch(
  () => [props.showPlaceholder, props.placeholderText, props.modelValue],
  () => {
    if (!view) return
    view.dispatch({ effects: phC.reconfigure(placeholderExt()) })
    requestAnimationFrame(syncAutoHeight)
  }
)

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
  <div ref="host" class="cm-host" :class="typeClass" />
</template>

<style scoped>
.cm-host {
  width: 100%;
  /* altezza gestita da JS quando autoHeight=true */
}

/* IMPORTANT: NON lasciare font-size 90px 😄 */
.cm-host :deep(.cm-editor),
.cm-host :deep(.cm-editor.cm-focused) {
  outline: none !important;
  font: inherit;
}

/* Varianti come prima (applicate al contenuto) */
.cm-host.h1 :deep(.cm-content) { font-size: 28px; font-weight: 700; line-height: 1.25em; }
.cm-host.h2 :deep(.cm-content) { font-size: 22px; font-weight: 650; line-height: 1.3em; }
.cm-host.h3 :deep(.cm-content) { font-size: 18px; font-weight: 600; line-height: 1.35em; }

.cm-host.quote {
  padding-left: 10px;
  border-left: 3px solid var(--quote-border);
}
</style>
