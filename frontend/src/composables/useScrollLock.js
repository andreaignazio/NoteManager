import { ref } from 'vue'

export default function useScrollLock() {
  const locked = ref(false)
  let scrollY = 0
  let overlayEl = null
  let onWheel, onTouchMove, onKeyDown, onScroll
  let lockCount = 0

  function doLock() {
    if (locked.value) return
    locked.value = true

    scrollY = window.scrollY || window.pageYOffset

    overlayEl = document.createElement('div')
    overlayEl.className = 'scroll-lock-overlay'
    Object.assign(overlayEl.style, {
      position: 'fixed',
      inset: '0',
      background: 'transparent',
      zIndex: '1500',
      pointerEvents: 'auto',
    })
    document.body.appendChild(overlayEl)

    onWheel = (e) => e.preventDefault()
    overlayEl.addEventListener('wheel', onWheel, { passive: false })

    onTouchMove = (e) => e.preventDefault()
    overlayEl.addEventListener('touchmove', onTouchMove, { passive: false })

    const SCROLL_KEYS = new Set(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' ','Spacebar'])
    onKeyDown = (e) => {
      if (SCROLL_KEYS.has(e.key)) e.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown, true)

    onScroll = () => {
      if (!locked.value) return
      if (window.scrollY !== scrollY) window.scrollTo(0, scrollY)
    }
    window.addEventListener('scroll', onScroll, true)
    
  }

  function doUnlock() {
    if (!locked.value) return
    locked.value = false

    window.removeEventListener('keydown', onKeyDown, true)
    window.removeEventListener('scroll', onScroll, true)

    if (overlayEl) {
      overlayEl.remove()
      overlayEl = null
    }
  }

  function lock() {
    lockCount++
    if (lockCount === 1) doLock()
      console.log("do_lock:", locked.value)
  }

  function unlock() {
    lockCount = Math.max(0, lockCount - 1)
    if (lockCount === 0) doUnlock()
  }

  function reset() {
    lockCount = 0
    doUnlock()
  }

  return { locked, lock, unlock, reset }
}