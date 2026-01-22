import { defineStore } from 'pinia'


export type AnchorKey = string
export type MenuId = string

export interface OpenMenuRequest<TPayload = unknown> {
  menuId: MenuId
  anchorKey: AnchorKey
  payload?: TPayload
}

export interface UIOverlayMenuController<TPayload = unknown> {
  menuId: MenuId
  /**
   * Invocata dallo store quando qualcuno richiede l'apertura.
   * L'host/menu deve risolvere l'ancora tramite anchorKey (usando AnchorsStore)
   * e aprirsi.
   */
  open: (req: OpenMenuRequest<TPayload>) => void

  /** Invocata dallo store per chiudere il menu */
  close: () => void
}

export interface UIOverlayStore {
  // registry
  registerMenu<TPayload = unknown>(controller: UIOverlayMenuController<TPayload>): () => void

  // API per il resto dell'app
  requestOpen<TPayload = unknown>(req: OpenMenuRequest<TPayload>): void
  requestClose(menuId: MenuId): void

  // stato utile
  activeRequestByMenuId: Record<MenuId, OpenMenuRequest<any> | null>
}


export const useUIOverlayStore = defineStore('ui-overlay', {
  state: () => ({
    _menus: new Map<MenuId, UIOverlayMenuController<any>>(),
    activeRequestByMenuId: {} as Record<MenuId, OpenMenuRequest<any> | null>,

    }),  actions: {    

      registerMenu(controller: UIOverlayMenuController<any>) {
      this._menus.set(controller.menuId, controller)
      // opzionale: init stato
      if (!(controller.menuId in this.activeRequestByMenuId)) {
        this.activeRequestByMenuId[controller.menuId] = null
      }

      // unsubscriber
      return () => {
        const current = this._menus.get(controller.menuId)
        // evita di cancellare se è stato sostituito da un'altra istanza
        if (current === controller) this._menus.delete(controller.menuId)
      }
    },
    requestOpen(req: OpenMenuRequest<any>) {
      this.activeRequestByMenuId[req.menuId] = req
      const menu = this._menus.get(req.menuId)
      if (!menu) return
      menu.open(req)
    },

    requestClose(menuId: MenuId) {
      this.activeRequestByMenuId[menuId] = null
      const menu = this._menus.get(menuId)
      if (!menu) return
      menu.close()
    },
  }
})