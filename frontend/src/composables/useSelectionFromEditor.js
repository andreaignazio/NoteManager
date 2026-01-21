import { onMounted } from 'vue'


export function useSelectionFromEditor(editorRef) {
  function commit() {
    window.dispatchEvent(new CustomEvent('selection-toolbar:commit'))
  }

  function clear() {
    window.dispatchEvent(new CustomEvent('selection-toolbar:clear'))
  }

  onMounted(() => {
    const editor = editorRef.value
    if (!editor) return

    editor.on('selectionUpdate', () => {
      const { from, to } = editor.state.selection
      if (from !== to) commit()
      else clear()
    })
  })
}
