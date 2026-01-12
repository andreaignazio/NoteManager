// src/stores/ui.js
import { defineStore } from 'pinia'

const STORAGE_KEY = 'myasset.ui.v1'

const clamp = (v, min, max) => Math.max(min, Math.min(max, v))

export const useUiStore = defineStore('ui', {
  state: () => ({
    // persisted
    sidebarMode: 'docked', // 'docked' | 'hidden'
    sidebarWidth: 280,

    // non-persisted (optional)
    _hydrated: false,
    topbarHidden: false,
  }),

  getters: {
    sidebarMinWidth: () => 220,
    sidebarMaxWidth: () => 420,
    topbarHeight: () => 52,
  },

  actions: {
    setTopbarHidden(v) { this.topbarHidden = !!v },
    hydrate() {
      if (this._hydrated) return
      this._hydrated = true

      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return
        const data = JSON.parse(raw)

        if (data?.sidebarMode === 'docked' || data?.sidebarMode === 'hidden') {
          this.sidebarMode = data.sidebarMode
        }
        if (typeof data?.sidebarWidth === 'number') {
          this.sidebarWidth = clamp(data.sidebarWidth, this.sidebarMinWidth, this.sidebarMaxWidth)
        }
      } catch {
        // ignore
      }
    },

    persist() {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            sidebarMode: this.sidebarMode,
            sidebarWidth: this.sidebarWidth,
          })
        )
      } catch {
        // ignore
      }
    },

    setSidebarMode(mode) {
      if (mode !== 'docked' && mode !== 'hidden') return
      this.sidebarMode = mode
      this.persist()
    },

    toggleSidebarMode() {
      this.setSidebarMode(this.sidebarMode === 'docked' ? 'hidden' : 'docked')
    },

    setSidebarWidth(px) {
      this.sidebarWidth = clamp(px, this.sidebarMinWidth, this.sidebarMaxWidth)
      this.persist()
    },
  },
})

export default useUiStore