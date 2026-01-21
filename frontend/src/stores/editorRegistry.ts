// src/stores/editorRegistry.ts
import { defineStore } from 'pinia'
import { shallowRef, computed } from 'vue'

export const useEditorRegistryStore = defineStore('editorRegistry', () => {
  // Map(blockId -> Editor)
  const registry = shallowRef<Map<string, any>>(new Map())

  function registerEditor(blockId: string | number, editor: any | null) {
    const id = String(blockId)
    const next = new Map(registry.value)
    if (editor) next.set(id, editor)
    else next.delete(id)
    registry.value = next
  }

  function getEditor(blockId: string | number | null | undefined) {
    if (blockId == null) return null
    return registry.value.get(String(blockId)) ?? null
  }

  return { registry, registerEditor, getEditor }
})
