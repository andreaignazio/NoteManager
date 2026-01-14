import { nextTick, onMounted } from 'vue'

export function useAutoResizeTextarea(elRef) {
  const resize = () => {
    const el = elRef.value
    if (!el) return

    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }

  onMounted(() => nextTick(resize))

  return { resize }
}

export function createTextareaAutoResizer() {
  let el = null
  let ro = null
  let raf = 0

  const resize = () => {
    if (!el) return
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(() => {
      // auto è più stabile di 0px
      el.style.height = 'auto'
      el.style.overflowY = 'hidden'
      el.style.height = `${el.scrollHeight}px`
    })
  }

  const attach = (textareaEl, observeEl = null) => {
    detach()
    el = textareaEl
    if (!el) return

    // osserva o la textarea o un wrapper (meglio wrapper se padding/bordi)
    const target = observeEl || el

    ro = new ResizeObserver(() => {
      resize()
    })
    ro.observe(target)

    // prima misura
    resize()
  }

  const detach = () => {
    if (ro) {
      try { ro.disconnect() } catch {}
      ro = null
    }
    cancelAnimationFrame(raf)
    raf = 0
    el = null
  }

  return { attach, detach, resize }
}