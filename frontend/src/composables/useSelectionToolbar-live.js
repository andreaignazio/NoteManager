import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * Floating toolbar anchored to current selection for a Tiptap editor.
 * - no tippy
 * - uses coordsAtPos
 * - position: fixed in viewport (good with scroll containers + overflow hidden)
 */
export function useSelectionToolbar(editorRef, opts = {}) {
  const isOpen = ref(false)
  const x = ref(0)
  const y = ref(0)

  const gap = opts.gap ?? 8          // distance from selection
  const minSel = opts.minSel ?? 1    // minimum selection length
  const shouldShow = opts.shouldShow // optional fn({ editor, state }) => boolean

  function compute() {
    const editor = editorRef.value
    if (!editor || editor.isDestroyed) {
      isOpen.value = false
      return
    }

    const { state, view } = editor
    if (!view?.hasFocus()) {
      isOpen.value = false
      return
    }

    const { from, to } = state.selection
    const selLen = Math.abs(to - from)

    if (selLen < minSel) {
      isOpen.value = false
      return
    }

    if (shouldShow && !shouldShow({ editor, state })) {
      isOpen.value = false
      return
    }

    // Coordinates for selection
    console.log("From-To:", from, to)
    const start = view.coordsAtPos(from)
    const end = view.coordsAtPos(to)
    const midX = (start.left + end.right) / 2
    const topY = Math.min(start.top, end.top)
    console.log("Coords:", start, end)
    x.value = midX
    y.value = topY - gap
    isOpen.value = true
  }

  // Throttle to next frame to avoid jank during typing/drag selection
  let raf = 0
  function scheduleCompute() {
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(compute)
  }

  function onSelectionChange() {
    scheduleCompute()
  }

  function onScrollOrResize() {
    scheduleCompute()
  }

  onMounted(() => {
    document.addEventListener('selectionchange', onSelectionChange, { passive: true })
    window.addEventListener('scroll', onScrollOrResize, { passive: true, capture: true })
    window.addEventListener('resize', onScrollOrResize, { passive: true })
  })

  onBeforeUnmount(() => {
    document.removeEventListener('selectionchange', onSelectionChange)
    window.removeEventListener('scroll', onScrollOrResize, true)
    window.removeEventListener('resize', onScrollOrResize)
    cancelAnimationFrame(raf)
  })

  return { isOpen, x, y, compute, scheduleCompute }
}
