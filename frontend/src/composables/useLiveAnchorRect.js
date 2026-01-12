import { computed, onBeforeUnmount, ref, unref, watch } from "vue"

function readRect(el) {
  const r = el.getBoundingClientRect()
  return {
    top: r.top,
    left: r.left,
    right: r.right,
    bottom: r.bottom,
    width: r.width,
    height: r.height,
  }
}

/**
 * @param {HTMLElement | import('vue').Ref<HTMLElement|null|undefined> | null | undefined} anchorEl
 * @param {import('vue').Ref<boolean>} enabled
 * @param {{ captureScroll?: boolean }=} opts
 */
export default function useLiveAnchorRect(anchorEl, enabled, opts) {
  const rect = ref(null)

  let raf = 0
  const captureScroll = opts?.captureScroll ?? true

  const getEl = () => {
    // supporta sia HTMLElement che ref<HTMLElement>
    return unref(anchorEl) ?? null
  }

  const updateNow = () => {
    const el = getEl()
    if (!enabled.value || !el) {
      rect.value = null
      return
    }
    const r = readRect(el)
    // se è "strano" e siamo attivi, riprova al prossimo frame
    if ((r.width === 0 && r.height === 0) || !Number.isFinite(r.top) || !Number.isFinite(r.left)) {
    rect.value = null
    scheduleUpdate()
    return
    }
    rect.value = r
  }

  const scheduleUpdate = () => {
    if (!enabled.value) return
    if (raf) cancelAnimationFrame(raf)
    raf = requestAnimationFrame(() => {
      raf = 0
      updateNow()
    })
  }

  const onResize = () => scheduleUpdate()
  const onScroll = () => scheduleUpdate()

  const scrollOpts = { passive: true, capture: captureScroll }
  const resizeOpts = { passive: true }

  const start = () => {
    updateNow()
    scheduleUpdate()
    window.addEventListener("resize", onResize, resizeOpts)
    window.addEventListener("scroll", onScroll, scrollOpts)
  }

  const stop = () => {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    window.removeEventListener("resize", onResize, resizeOpts)
    window.removeEventListener("scroll", onScroll, scrollOpts)
    rect.value = null
  }

  watch(
    enabled,
    (isOn) => {
      if (isOn) start()
      else stop()
    },
    { immediate: true }
  )

  watch(
    () => getEl(),
    () => {
      if (enabled.value) scheduleUpdate()
    }
  )

  onBeforeUnmount(() => stop())

  const anchorRect = computed(() => (enabled.value ? rect.value : null))

  return { anchorRect, updateNow, scheduleUpdate }
}