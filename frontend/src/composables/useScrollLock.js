import { ref } from 'vue'

/*export default function useScrollLock() {
  const locked = ref(false)
  let scrollY = 0
  let prev = {}

  function getScrollbarWidth() {
    // quanto spazio occupa la scrollbar (0 su overlay scrollbars tipo macOS)
    return window.innerWidth - document.documentElement.clientWidth
  }

  function lock() {
    if (locked.value) return
    locked.value = true

    const body = document.body
    const html = document.documentElement

    scrollY = window.scrollY || window.pageYOffset

    // salva stile precedente per ripristino pulito
    prev = {
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      bodyWidth: body.style.width,
      bodyOverflow: body.style.overflow,
      bodyPaddingRight: body.style.paddingRight,
      htmlOverflow: html.style.overflow,
    }

    const sbw = getScrollbarWidth()

    // blocca scroll SENZA far “saltare” il contenuto
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    body.style.width = '100%'

    // scrollbar sparirebbe -> compenso lo spazio
    if (sbw > 0) {
      body.style.paddingRight = `${sbw}px`
    }

    // evita scroll via keyboard / wheel sul documento
    html.style.overflow = 'hidden'
  }

  function unlock() {
    if (!locked.value) return
    locked.value = false

    const body = document.body
    const html = document.documentElement

    body.style.position = prev.bodyPosition || ''
    body.style.top = prev.bodyTop || ''
    body.style.left = prev.bodyLeft || ''
    body.style.right = prev.bodyRight || ''
    body.style.width = prev.bodyWidth || ''
    body.style.overflow = prev.bodyOverflow || ''
    body.style.paddingRight = prev.bodyPaddingRight || ''
    html.style.overflow = prev.htmlOverflow || ''

    // ripristina scroll esatto
    window.scrollTo(0, scrollY)
  }

  return { locked, lock, unlock }
}*/
/*
export default function useScrollLock() {
  const locked = ref(false)
  let scrollY = 0
  let overlayEl = null
  let onWheel, onTouchMove, onKeyDown, onScroll

  function lock() {
    if (locked.value) return
    locked.value = true

    scrollY = window.scrollY || window.pageYOffset

    // Overlay che blocca interazioni col contenuto + scrollbar,
    // ma tu metti il menu sopra con z-index maggiore.
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

    // Blocca wheel / trackpad
    onWheel = (e) => e.preventDefault()
    overlayEl.addEventListener('wheel', onWheel, { passive: false })

    // Blocca touch scroll
    onTouchMove = (e) => e.preventDefault()
    overlayEl.addEventListener('touchmove', onTouchMove, { passive: false })

    // Blocca tasti che scrollano
    const SCROLL_KEYS = new Set([
      'ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' ','Spacebar'
    ])
    onKeyDown = (e) => {
      if (SCROLL_KEYS.has(e.key)) e.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown, true)

    // Se qualche cosa prova comunque a scrollare, torna su
    onScroll = () => {
      if (!locked.value) return
      if (window.scrollY !== scrollY) window.scrollTo(0, scrollY)
    }
    window.addEventListener('scroll', onScroll, true)
  }

  function unlock() {
    if (!locked.value) return
    locked.value = false

    window.removeEventListener('keydown', onKeyDown, true)
    window.removeEventListener('scroll', onScroll, true)

    if (overlayEl) {
      overlayEl.remove()
      overlayEl = null
    }
  }

  return { locked, lock, unlock }
}*/



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