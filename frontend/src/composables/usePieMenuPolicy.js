// usePieMenuPolicy.js
import { onMounted, onBeforeUnmount } from "vue"

export function usePieMenuPolicy({
  isOpen = () => false,
  open,
  close,
  getContextAt,

  canOpen = () => true,
  longPressMs = 220,   // un po’ più “umano” del 100
  moveThresh = 6,
}) {
  let timer = null
  let pointerDown = false
  let cancelled = false
  let openedDynamic = false
  let down = { x: 0, y: 0 }

  function clearTimer() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  function getAreaFromEvent(e) {
    const t = e.target
    if (!(t instanceof Element)) return "main"
    const areaEl = t.closest("[data-pie-area]")
    return areaEl?.getAttribute("data-pie-area") || "main"
  }

  function defaultGetContextAt(e) {
    const t = e.target
    const area = getAreaFromEvent(e)
    if (!(t instanceof Element)) return { area }

    const blockEl = t.closest("[data-block-id]") || t.closest("[data-id]")
    const blockId =
      blockEl?.getAttribute("data-block-id") ||
      blockEl?.getAttribute("data-id") ||
      null

    return area === "main" ? { area, blockId } : { area, pageId: blockId }
  }

  function onPointerDown(e) {
    if (isOpen()) return 
    // SOLO right click
    if (e.button !== 2) return
    if (!(e.target instanceof Element)) return

     if (!canOpen()) return
    // fondamentale: evita caret/focus del testo + menu nativo
    e.preventDefault()
    e.stopPropagation()

    pointerDown = true
    cancelled = false
    openedDynamic = false
    down = { x: e.clientX, y: e.clientY }

    clearTimer()

    timer = setTimeout(() => {
      if (!pointerDown || cancelled) return

      openedDynamic = true

      if (isOpen()) close?.()

      const area = getAreaFromEvent(e)
      const context = (getContextAt ?? defaultGetContextAt)(e)

      open({
        kind: "dynamic",
        mode: e.altKey ? "ai" : "block",
        area,
        x: down.x,
        y: down.y,
        context,
      })
    }, longPressMs)
  }

  function onPointerMove(e) {
    if (!pointerDown) return
    const dx = Math.abs(e.clientX - down.x)
    const dy = Math.abs(e.clientY - down.y)
    if (dx > moveThresh || dy > moveThresh) {
      cancelled = true
      clearTimer()
    }
  }

  function onPointerUp(e) {
     if (isOpen()) return 
    if (!pointerDown) return
    pointerDown = false

    // solo se era right click
    if (e.button !== 2) {
      clearTimer()
      return
    }

    e.preventDefault()
    e.stopPropagation()

    // se abbiamo già aperto dynamic col timer, non fare nulla
    if (openedDynamic) {
      clearTimer()
      return
    }

    // altrimenti: quick release => context
    clearTimer()

    if (!canOpen()) return

    if (isOpen()) close?.()

    const area = getAreaFromEvent(e)
    const context = (getContextAt ?? defaultGetContextAt)(e)

    open({
      kind: "context",
      mode: e.altKey ? "ai" : "block",
      area,
      x: down.x,
      y: down.y,
      context,
    })
  }

  function onContextMenu(e) {
    // blocca SEMPRE il menu nativo (soprattutto su editor)
    e.preventDefault()
    e.stopPropagation()
  }

  onMounted(() => {
    window.addEventListener("contextmenu", onContextMenu, true)
    window.addEventListener("pointerdown", onPointerDown, true)
    window.addEventListener("pointermove", onPointerMove, { passive: true, capture: true })
    window.addEventListener("pointerup", onPointerUp, true)
  })

  onBeforeUnmount(() => {
    window.removeEventListener("contextmenu", onContextMenu, true)
    window.removeEventListener("pointerdown", onPointerDown, true)
    window.removeEventListener("pointermove", onPointerMove, true)
    window.removeEventListener("pointerup", onPointerUp, true)
    clearTimer()
  })
}
