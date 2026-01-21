import { onMounted, onBeforeUnmount } from 'vue'

export function useSelectionPolicy({
  getActiveEditor,
  onCommitSelection,
  onClearSelection,
}) {
  let pointerDown = false
  let downX = 0
  let downY = 0
  let moved = false
  let startedInsideEditor = false
  let clearedOnDrag = false

  // ✅ PATCH: editor “sticky” durante il gesto
  let gestureEditor = null

  const THRESH = 3

  function hasSelection(editor) {
    if (!editor || editor.isDestroyed) return false
    const { from, to } = editor.state.selection
    return Math.abs(to - from) > 0
  }

  function getEditorForGesture() {
    // se abbiamo un editor fissato per questo gesto, usiamo quello
    return gestureEditor || getActiveEditor()
  }

  function onPointerDown(e) {
    pointerDown = true
    moved = false
    clearedOnDrag = false
    downX = e.clientX
    downY = e.clientY

    const editor = getActiveEditor()

    startedInsideEditor =
      !!editor && e.target instanceof Node && editor.view?.dom?.contains(e.target)

    // ✅ PATCH: se il gesto nasce dentro l’editor, “fissiamo” quell’istanza
    gestureEditor = startedInsideEditor ? editor : null
  }

  function onPointerMove(e) {
    if (!pointerDown) return

    const dx = Math.abs(e.clientX - downX)
    const dy = Math.abs(e.clientY - downY)

    if (!moved && (dx > THRESH || dy > THRESH)) {
      moved = true

      // se il drag NON è selezione testo (iniziato fuori editor), chiudi subito
      if (!startedInsideEditor && !clearedOnDrag) {
        clearedOnDrag = true
        onClearSelection()
      }
    }
  }

  function finalizeSelection() {
    // quando finisce il gesto, valutiamo selezione sull’editor giusto
    //const editor = getEditorForGesture()
    onCommitSelection()
    /*if (editor && hasSelection(editor)) onCommitSelection()
    else onClearSelection()*/
  }

  function onPointerUp() {
    pointerDown = false

    /*if (clearedOnDrag) {
      gestureEditor = null
      return
    }*/

    // ✅ PATCH: aspetta 1 frame per lasciare a ProseMirror il tempo di finalizzare la selection
    requestAnimationFrame(() => {
      finalizeSelection()
      gestureEditor = null
    })
  }

  // ✅ PATCH: copre selezioni da tastiera / programmatiche
  function onSelectionChange() {
    // se stai trascinando fuori e hai già chiuso, ignora
    if (clearedOnDrag) return

    const editor = getActiveEditor()
    if (!editor || editor.isDestroyed) return

    if (hasSelection(editor)) onCommitSelection()
    else onClearSelection()
  }

  onMounted(() => {
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('pointermove', onPointerMove, true)
    window.addEventListener('pointerup', onPointerUp, true)
    window.addEventListener('pointercancel', onPointerUp, true)

    document.addEventListener('selectionchange', onSelectionChange, true)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('pointerdown', onPointerDown, true)
    window.removeEventListener('pointermove', onPointerMove, true)
    window.removeEventListener('pointerup', onPointerUp, true)
    window.removeEventListener('pointercancel', onPointerUp, true)

    document.removeEventListener('selectionchange', onSelectionChange, true)
  })
}


