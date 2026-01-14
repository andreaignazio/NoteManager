import { defineStore } from 'pinia'

let _installed = false

function getActiveEl() {
  return document.activeElement instanceof HTMLElement ? document.activeElement : null
}

export const useOverlayStore = defineStore('overlay', {
  state: () => ({
    stack: [], // [{ id, close, getMenuEl, getAnchorEl, options, _prevActive }]
  }),

  getters: {
    top(state) {
      return state.stack[state.stack.length - 1] || null
    },
    hasAny(state) {
      return state.stack.length > 0
    },
    hasScrollLock(state) {
      return state.stack.some(l => l.options?.lockScroll)
    },
    activeId: (state) => state.stack[state.stack.length-1]?.id ?? null
  },

  actions: {
    install() {
      if (_installed) return
      _installed = true
      window.addEventListener('keydown', this._onKeydown, true)
      window.addEventListener('pointerdown', this._onPointerDown, true)
    },

    open(layer) {
      this.install()

      // de-dup by id
      this.stack = this.stack.filter(l => l.id !== layer.id)

      this.stack.push({
        ...layer,
        _prevActive: getActiveEl(),
        options: {
          closeOnEsc: true,
          closeOnOutside: true,
          lockScroll: false,
          stopPointerOutside: true,
          allowAnchorClick: true,
          restoreFocus: true,
          ...(layer.options || {}),
        },
      })

      this._applyScrollLock()
    },

    close(id) {
      console.log("overaly close")
      const idx = this.stack.findIndex(l => l.id === id)
      if (idx === -1) return

      const layer = this.stack[idx]
      this.stack.splice(idx, 1)

      this._applyScrollLock()

      if (layer.options?.restoreFocus) {
        queueMicrotask(() => layer._prevActive?.focus?.())
      }

      layer.close?.()
    },
    remove(id) {
      this.stack = this.stack.filter(l => l.id !== id)
      this._applyScrollLock?.()
    },

    closeTop() {
      const top = this.top
      if (!top) return
      this.close(top.id)
    },
    clear() {
     
      this.stack = []
      this._applyScrollLock?.()
    },

    _applyScrollLock() {
      //===OPTION TO DISABLE SCROLL ON MENU OPENING BUT NOT NEEDED NOW===
      document.documentElement.classList.toggle('overlay-scroll-locked', this.hasScrollLock)
    },

    _onKeydown(e) {
      console.log("onKeyDown")
      const top = this.top
      if (!top) return
      if (e.key !== 'Escape') return
      if (!top.options.closeOnEsc) return

      e.preventDefault()
      e.stopPropagation()
      this.closeTop()
    },

    _onPointerDown(e) {
      
      console.log("OVERLAYS:onPointerDown")
      const top = this.top
      if (!top) return

      const menuEl = top.getMenuEl?.()
      console.log("OVERLAY_MENUel",menuEl)
      if (!menuEl) return
      if (menuEl && menuEl.contains(e.target)) return

      if (top.options.allowAnchorClick) {
        const anchorEl = top.getAnchorEl?.()
        if (anchorEl && anchorEl.contains?.(e.target)) return
      }
      console.log("MENU-EL:",menuEl,"AnchorEL:", )
      if (top.options.closeOnOutside) {
        console.log("OVERLAYS:closeOnOutside")
        e.preventDefault()
        e.stopPropagation()
        this.closeTop()
        return
      }

      if (top.options.stopPointerOutside) {
        e.preventDefault()
        e.stopPropagation()
      }
    },
  },
})