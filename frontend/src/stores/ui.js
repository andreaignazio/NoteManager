import { defineStore } from 'pinia'

const STORAGE_KEY = 'myasset.ui.v1'

const clamp = (v, min, max) => Math.max(min, Math.min(max, v))

export const useUiStore = defineStore('ui', {
  state: () => ({
    
    sidebarMode: 'docked', // 'docked' | 'hidden'
    sidebarWidth: 280,

    //themeMode: 'system', // 'system' | 'light' | 'dark'

    themeMode: 'light',
    lastOpenedPageId: null,
   
    _hydrated: false,
    topbarHidden: false,

    pageViewOnPointer: [],

    SidebarMoveToArmed: false,
    SidebarMoveToHoverPageId: null,

    recentlyAddedPageId: null,

    pendingSidebarScrollToPageId: null,

  }),

  getters: {
    sidebarMinWidth: () => 220,
    sidebarMaxWidth: () => 420,
    topbarHeight: () => 52,
  },

  actions: {
    armMoveTo() {
      this.SidebarMoveToArmed = true
      this.SidebarMoveToHoverPageId = null
    },
    disarmMoveTo() {
      this.SidebarMoveToArmed = false
      this.SidebarMoveToHoverPageId = null
    },
    setMoveToHoverPageId(id) {
      this.SidebarMoveToHoverPageId = id
    },

    requestScrollToPage(pageId) {
      this.pendingSidebarScrollToPageId = pageId
    },
    consumeScrollToPageRequest(pageId) {
      if (this.pendingSidebarScrollToPageId === pageId) {
        this.pendingSidebarScrollToPageId = null
        return true
      }
      return false
    },
   /* getSystemTheme() {
      return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light'
    },

    applyThemeToDom(mode) {
      const resolved = mode === 'system' ? getSystemTheme() : mode
      document.documentElement.dataset.theme = resolved // <html data-theme="dark">
    },*/
    setTopbarHidden(v) { this.topbarHidden = !!v },

    applyTheme(mode) {
      const html = document.documentElement;
      if(mode==='dark') {
        html.setAttribute('data-theme', 'dark')
        //localStorage.setItem('theme', 'dark')
      } else if(mode==='light') {
        html.setAttribute('data-theme', 'light')
        //localStorage.setItem('theme', 'light')
      } else {return}
    },

    toggleTheme() {
      if(this.themeMode==='light') {
        this.themeMode='dark'
        this.applyTheme('dark')
        this.persist()
      } else {
        this.themeMode='light'
        this.applyTheme('light')
        this.persist()
      }   
    },
    setLastAddedPageId(id){
      this.recentlyAddedPageId = id
      let t = setTimeout(()=>{
        this.recentlyAddedPageId = null
        clearTimeout(t)
      }, 500)
    },
    resetLstAddedPageId(){
      this.recentlyAddedPageId = null
    },
    getLastAddedPageId(){
      return this.recentlyAddedPageId ?? null
    },
    
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
        if(typeof data?.lastOpenedPageId === 'string'){
          this.lastOpenedPageId = data.lastOpenedPageId
        }
        this.applyTheme(this.themeMode)
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
            lastOpenedPageId: this.lastOpenedPageId,
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

    registerPageView(fn){
      this.pageViewOnPointer.push(fn)
    },

    callPageView(e){
      this.pageViewOnPointer?.at(-1)?.(e)
    }

  },
})

export default useUiStore