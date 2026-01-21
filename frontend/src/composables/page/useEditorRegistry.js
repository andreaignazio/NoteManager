import { shallowRef, computed } from 'vue'

export function useEditorRegistry(getActiveBlockId) {
  // Map(blockId -> tiptap editor instance)
  const registry = shallowRef(new Map())

  function registerEditor(blockId, editorInstance) {
    const id = String(blockId)
    const next = new Map(registry.value)
    if (editorInstance) next.set(id, editorInstance)
    else next.delete(id)
    registry.value = next
  }

  const activeEditor = computed(() => {
    const id = getActiveBlockId?.()
    if (!id) return null
    return registry.value.get(String(id)) || null
  })

  return { registerEditor, activeEditor, registry }
}
