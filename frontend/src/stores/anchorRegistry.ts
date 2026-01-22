/*// src/stores/editorRegistry.ts
import { defineStore } from 'pinia'
import { shallowRef, computed } from 'vue'

export const useAnchorRegistryStore = defineStore('anchorRegistry', () => {
  // Map(blockId -> Editor)
  const registry = shallowRef<Map<string, HTMLElement>>(new Map())

  function registerAnchor(key: string | number, el: any | null) {
    const id = String(key)
    const next = new Map(registry.value)
    if (el) next.set(id, el)
    else next.delete(id)
    registry.value = next
  }

  function getAnchorEl(key: string | number | null | undefined) {
    if (key == null) return null
    return registry.value.get(String(key)) ?? null
  }

  return { registry, registerAnchor, getAnchorEl }
})
*/
// src/stores/anchorRegistry.ts
import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

type AnchorKey = string
type AnchorEntry = {
  el: HTMLElement
  token: symbol
  ts: number
}

function normKey(key: string | number) {
  return String(key) as AnchorKey
}

export const useAnchorRegistryStore = defineStore('anchorRegistry', () => {
  // Map(anchorKey -> { el, token })
  const registry = shallowRef<Map<AnchorKey, AnchorEntry>>(new Map())

  /**
   * Registra un anchor e ritorna una funzione di cleanup "race-safe".
   * Se qualcuno registra di nuovo la stessa key, il vecchio cleanup NON cancella il nuovo.
   */
  function registerAnchor(key: string | number, el: HTMLElement | null) {
    const id = normKey(key)

    // se el è null: richiesta di rimozione "generica" (fallback)
    if (!el) {
      const next = new Map(registry.value)
      next.delete(id)
      registry.value = next
      return () => {} // no-op
    }

    const token = Symbol(`anchor:${id}`)
    const entry: AnchorEntry = { el, token, ts: Date.now() }

    const next = new Map(registry.value)
    next.set(id, entry)
    registry.value = next

    // cleanup sicuro: rimuove solo se la entry attuale è quella registrata da questo call
    return () => {
      const current = registry.value.get(id)
      if (current?.token !== token) return
      const next2 = new Map(registry.value)
      next2.delete(id)
      registry.value = next2
    }
  }

  function getAnchorEl(key: string | number | null | undefined) {
    if (key == null) return null
    const entry = registry.value.get(normKey(key))
    return entry?.el ?? null
  }

  // opzionale ma utile: check veloce
  function hasAnchor(key: string | number) {
    return registry.value.has(normKey(key))
  }

  return { registry, registerAnchor, getAnchorEl, hasAnchor }
})
