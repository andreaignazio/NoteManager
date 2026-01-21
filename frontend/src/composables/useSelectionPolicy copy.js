import { onMounted, onBeforeUnmount } from 'vue'

export function useSelectionPolicy({ getActiveEditor, onCommitSelection, onClearSelection }) {
  let pointerDown = false
  let downX = 0
  let downY = 0
  let moved = false
  let startedInsideEditor = false
  let clearedOnDrag = false

  const THRESH = 3

  function hasSelection(editor) {
    if (!editor || editor.isDestroyed) return false
    const { from, to } = editor.state.selection
    return Math.abs(to - from) > 0
  }

  function onPointerDown(e) {
    console.log("OnPonterDown:selection policy")
    pointerDown = true
    moved = false
    clearedOnDrag = false
    downX = e.clientX
    downY = e.clientY
 
    const editor = getActiveEditor()
    // importante: capire se il gesto nasce dentro l'editor (text selection) o fuori (drag blocco/UI)
    startedInsideEditor =
      !!editor && e.target instanceof Node && editor.view?.dom?.contains(e.target)
  }

  function onPointerMove(e) {
    if (!pointerDown) return
    const dx = Math.abs(e.clientX - downX)
    const dy = Math.abs(e.clientY - downY)

    if (!moved && (dx > THRESH || dy > THRESH)) {
      moved = true

      // ✅ se il drag NON è una selezione testo (iniziato fuori editor), chiudi subito
      if (!startedInsideEditor && !clearedOnDrag) {
        clearedOnDrag = true
        onClearSelection()
      }
    }
  }

  function onPointerUp() {
    pointerDown = false

    const editor = getActiveEditor()
    console.log("useSelectionPolicy onPointerUp - commit or clea0r", editor)
    //console.log('useSelectionPolicy onPointerUp', { clearedOnDrag, editor, hasSelection: hasSelection(editor) })
    // se abbiamo già chiuso per drag fuori editor, finiamo qui
    if (clearedOnDrag) return
    
    // fine gesto: mostra solo se c'è selezione valida, altrimenti chiudi
    if (editor && hasSelection(editor)) onCommitSelection()
    else onClearSelection()
  }

  onMounted(() => {
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('pointermove', onPointerMove, true)
    window.addEventListener('pointerup', onPointerUp, true)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('pointerdown', onPointerDown, true)
    window.removeEventListener('pointermove', onPointerMove, true)
    window.removeEventListener('pointerup', onPointerUp, true)
  })
}

