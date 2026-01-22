// uiOverlay.menu.types.ts
import type { MenuId, OpenMenuRequest } from './uiOverlay.types'

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
