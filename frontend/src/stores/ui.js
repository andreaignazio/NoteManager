import { defineStore } from 'pinia'

const STORAGE_KEY = 'myasset.ui.v1'

const clamp = (v, min, max) => Math.max(min, Math.min(max, v))

export const useUiStore = defineStore('ui', {
  state: () => ({
    
    sidebarMode: 'docked', // 'docked' | 'hidden'
    sidebarWidth: 280,

    themeMode: 'system', // 'system' | 'light' | 'dark'

   
    _hydrated: false,
    topbarHidden: false,
  }),

  getters: {
    sidebarMinWidth: () => 220,
    sidebarMaxWidth: () => 420,
    topbarHeight: () => 52,
  },

  actions: {
    getSystemTheme() {
      return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light'
    },

    applyThemeToDom(mode) {
      const resolved = mode === 'system' ? getSystemTheme() : mode
      document.documentElement.dataset.theme = resolved // <html data-theme="dark">
    },
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
        if (data?.themeMode === 'light' || data?.themeMode === 'dark' || data?.themeMode === 'system') {
          this.themeMode = data.themeMode
        }
        applyThemeToDom(this.themeMode)
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
            themeMode: this.themeMode,
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
    setThemeMode(mode) {
      if (mode !== 'light' && mode !== 'dark' && mode !== 'system') return
      this.themeMode = mode
      applyThemeToDom(mode)
      this.persist()
    },
  },
})

export default useUiStore