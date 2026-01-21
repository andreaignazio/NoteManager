import { nextTick } from 'vue'

export function useMenuAnchors() {
  const map = new Map() // key = `${id}:${kind}` -> HTMLElement

  function registerMenuAnchor(blockId, el, kind = 'actions') {
    if (!blockId) return
    const k = `${String(blockId)}:${kind}`
    if (el) map.set(k, el)
    else map.delete(k)
  }

  function getAnchor(blockId, kindOrKinds = 'actions') {
    const id = String(blockId)
    const kinds = Array.isArray(kindOrKinds) ? kindOrKinds : [kindOrKinds]

    for (const kind of kinds) {
      const el = map.get(`${id}:${kind}`)
      if (el) return el
    }
    return null
  }

  function makeOpenHandler({ getRef, setAnchorEl, setBlockId, kinds = ['actions'] }) {
    return function open(blockId, kindOverride) {
      const el = getAnchor(blockId, kindOverride || kinds)
      if (!el) return
      setAnchorEl(el)
      setBlockId(blockId)
      nextTick(() => getRef()?.open?.())
    }
  }

  return { registerMenuAnchor, getAnchor, makeOpenHandler }
}
