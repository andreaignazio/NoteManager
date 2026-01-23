import { defineStore } from "pinia";

export type AnchorKey = string;
export type MenuId = string;

export interface OpenMenuRequest<TPayload = unknown> {
  menuId: MenuId;
  anchorKey: AnchorKey;
  payload?: TPayload;
}
/** Confirm */
export type ConfirmResult<TResult = any> =
  | { ok: true; value: TResult }
  | { ok: false; reason: "cancel" | "closed" };

type ConfirmToken = string;

type PendingConfirm = {
  token: ConfirmToken;
  resolve: (v: any) => void;
};

export type ConfirmPayload = {
  __confirmToken?: string;

  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;

  // optional checkbox (es: "Keep children")
  checkbox?: {
    label: string;
    defaultValue?: boolean;
  };
};

export interface UIOverlayMenuController<TPayload = unknown> {
  menuId: MenuId;
  /**
   * Invocata dallo store quando qualcuno richiede l'apertura.
   * L'host/menu deve risolvere l'ancora tramite anchorKey (usando AnchorsStore)
   * e aprirsi.
   */
  open: (req: OpenMenuRequest<TPayload>) => void;

  /** Invocata dallo store per chiudere il menu */
  close: () => void;
}

export interface UIOverlayStore {
  // registry
  registerMenu<TPayload = unknown>(
    controller: UIOverlayMenuController<TPayload>,
  ): () => void;

  // API per il resto dell'app
  requestOpen<TPayload = unknown>(req: OpenMenuRequest<TPayload>): void;
  requestClose(menuId: MenuId): void;

  // stato utile
  activeRequestByMenuId: Record<MenuId, OpenMenuRequest<any> | null>;
}

export const useUIOverlayStore = defineStore("ui-overlay", {
  state: () => ({
    _menus: new Map<MenuId, UIOverlayMenuController<any>>(),
    activeRequestByMenuId: {} as Record<MenuId, OpenMenuRequest<any> | null>,

    _pendingConfirmByMenuId: new Map<MenuId, PendingConfirm>(),
  }),
  actions: {
    registerMenu(controller: UIOverlayMenuController<any>) {
      this._menus.set(controller.menuId, controller);
      // opzionale: init stato
      if (!(controller.menuId in this.activeRequestByMenuId)) {
        this.activeRequestByMenuId[controller.menuId] = null;
      }

      // unsubscriber
      return () => {
        const current = this._menus.get(controller.menuId);
        // evita di cancellare se è stato sostituito da un'altra istanza
        if (current === controller) this._menus.delete(controller.menuId);
      };
    },
    requestOpen(req: OpenMenuRequest<any>) {
      this.activeRequestByMenuId[req.menuId] = req;
      const menu = this._menus.get(req.menuId);
      if (!menu) return;
      menu.open(req);
    },

    requestClose(menuId: MenuId) {
      this.activeRequestByMenuId[menuId] = null;
      const menu = this._menus.get(menuId);
      if (menu) menu.close();

      // ✅ se chiudi un confirm senza risolvere, risolvi come "closed"
      const pending = this._pendingConfirmByMenuId.get(menuId);
      if (pending) {
        this._pendingConfirmByMenuId.delete(menuId);
        pending.resolve({ ok: false, reason: "closed" });
      }
    },

    requestConfirm<TPayload extends object, TResult = any>(
      req: OpenMenuRequest<TPayload>,
    ): Promise<ConfirmResult<TResult>> {
      const token = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      return new Promise((resolve) => {
        // se c'è già un confirm pending su quel menu, chiudilo/risolvilo
        const prev = this._pendingConfirmByMenuId.get(req.menuId);
        if (prev) {
          this._pendingConfirmByMenuId.delete(req.menuId);
          prev.resolve({ ok: false, reason: "closed" });
        }

        this._pendingConfirmByMenuId.set(req.menuId, { token, resolve });

        // apri menu passando token nel payload (non rompe gli altri menu)
        this.requestOpen({
          ...req,
          payload: { ...(req.payload ?? {}), __confirmToken: token },
        });
      });
    },
    resolveConfirm<TResult = any>(
      menuId: MenuId,
      token: ConfirmToken | undefined,
      result: ConfirmResult<TResult>,
    ) {
      const pending = this._pendingConfirmByMenuId.get(menuId);
      if (!pending) return;
      // race-safe: risolvi solo se token matcha quello attivo
      if (!token || pending.token !== token) return;

      this._pendingConfirmByMenuId.delete(menuId);
      pending.resolve(result);

      // chiudi UI
      this.requestClose(menuId);
    },
  },
});
