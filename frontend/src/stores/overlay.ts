// stores/overlay.ts
import { defineStore } from "pinia";

export type AnchorLike = {
  getBoundingClientRect: () => DOMRect;
} | null;

let _installed = false;

function getActiveEl() {
  return document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
}
const now = () => Date.now();

export type OverlayKind =
  | "hoverbar"
  | "pie"
  | "dropdown"
  | "tooltip"
  | "modal"
  | string;

export type OverlayBehaviour =
  | "stack" // additivo: push sopra
  | "replaceLower" // rimuove quelli con priority inferiore
  | "exclusiveKinds" // rimuove i kind indicati
  | "exclusiveAll"; // rimuove tutto (tranne eventualmente whitelist)

export type OverlayInteractionScope = "local" | "global";

export interface OverlayBinding {
  id: string;
  kind?: OverlayKind;
  priority?: number;
  behaviour?: OverlayBehaviour;
  exclusiveKinds?: OverlayKind[];
  keepKinds?: OverlayKind[];
  identityKey?: string;

  // LIVE SOURCE OF TRUTH
  isOpen: () => boolean;

  // LIVE fields
  getInteractionScope?: () => OverlayInteractionScope;

  // commands
  requestClose: (
    reason: "escape" | "outside" | "replace" | "programmatic",
  ) => void;

  // elements
  getMenuEl?: () => AnchorLike;
  getAnchorEl?: () => AnchorLike;

  options?: OverlayLayer["options"];
}

export interface OverlayLayer {
  // retrocompat
  id: string;
  close?: () => void;
  getMenuEl?: () => AnchorLike;
  getAnchorEl?: () => AnchorLike;
  options?: {
    closeOnEsc?: boolean;
    closeOnOutside?: boolean;
    lockScroll?: boolean;
    stopPointerOutside?: boolean;
    allowAnchorClick?: boolean;
    restoreFocus?: boolean;
  };

  // new world
  kind?: OverlayKind;
  priority?: number;
  behaviour?: OverlayBehaviour;
  identityKey?: string; // per update no-flicker
  exclusiveKinds?: OverlayKind[]; // usato se behaviour='exclusiveKinds'
  keepKinds?: OverlayKind[]; // whitelist per exclusiveAll (opzionale)
  interactionScope?: OverlayInteractionScope;
}

interface OverlayEntry extends Required<Pick<OverlayLayer, "id">> {
  // stored fields
  close?: () => void;
  getMenuEl?: () => AnchorLike;
  getAnchorEl?: () => AnchorLike;
  options: Required<NonNullable<OverlayLayer["options"]>>;

  kind?: OverlayKind;
  priority: number;
  behaviour: OverlayBehaviour;
  identityKey?: string;
  exclusiveKinds?: OverlayKind[];
  keepKinds?: OverlayKind[];
  interactionScope: OverlayInteractionScope;

  _prevActive: HTMLElement | null;
  createdAt: number;
}
function resolveScope(
  v: OverlayInteractionScope | undefined,
): "local" | "global" {
  if (!v) return "local";
  return typeof v === "function" ? v() : v;
}

export const useOverlayStore = defineStore("overlay", {
  state: () => ({
    stack: [] as OverlayEntry[],
    suppressedUntil: new Map<OverlayKind, number>(),
    bindings: new Map<string, OverlayBinding>(),
  }),

  getters: {
    top(state) {
      return state.stack[state.stack.length - 1] || null;
    },
    hasAny(state) {
      return state.stack.length > 0;
    },
    hasScrollLock(state) {
      return state.stack.some((l) => l.options?.lockScroll);
    },
    activeId: (state) => state.stack[state.stack.length - 1]?.id ?? null,
    has: (state) => (id: string) => state.stack.some((l) => l.id === id),
    isSuppressed: (state) => (kind?: OverlayKind) => {
      if (!kind) return false;
      const until = state.suppressedUntil.get(kind) ?? 0;
      return now() < until;
    },
  },

  actions: {
    install() {
      if (_installed) return;
      _installed = true;
      window.addEventListener("keydown", this._onKeydown, true);
      window.addEventListener("pointerdown", this._onPointerDown, true);
    },

    suppress(kind: OverlayKind, ms = 250) {
      this.suppressedUntil.set(kind, now() + ms);
    },

    _normalize(layer: OverlayLayer): OverlayEntry {
      const modalityDefaults = {}; // (se vuoi, qui puoi distinguere hover vs explicit)

      return {
        id: layer.id,
        close: layer.close,
        getMenuEl: layer.getMenuEl,
        getAnchorEl: layer.getAnchorEl,

        kind: layer.kind,
        priority: layer.priority ?? 0,
        behaviour: layer.behaviour ?? "stack",
        identityKey: layer.identityKey,
        exclusiveKinds: layer.exclusiveKinds,
        keepKinds: layer.keepKinds,
        interactionScope: resolveScope(layer.interactionScope),

        createdAt: now(),
        _prevActive: getActiveEl(),

        options: {
          closeOnEsc: true,
          closeOnOutside: true,
          lockScroll: false,
          stopPointerOutside: true,
          allowAnchorClick: true,
          restoreFocus: true,
          ...(modalityDefaults as any),
          ...(layer.options || {}),
        },
      };
    },

    // ========== RETRO API (UNCHANGED BEHAVIOUR) ==========
    open(layer: OverlayLayer) {
      this.install();
      const entry = this._normalize(layer);

      // de-dup by id (come prima)
      this.stack = this.stack.filter((l) => l.id !== entry.id);
      this.stack.push(entry);
      this._applyScrollLock();
    },

    close(id: string) {
      const idx = this.stack.findIndex((l) => l.id === id);
      if (idx === -1) return;

      const layer = this.stack[idx];
      this.stack.splice(idx, 1);

      this._applyScrollLock();

      if (layer.options.restoreFocus) {
        queueMicrotask(() => layer._prevActive?.focus?.());
      }
      layer.close?.();
    },

    remove(id: string) {
      this.stack = this.stack.filter((l) => l.id !== id);
      this._applyScrollLock();
    },

    closeTop() {
      const top = this.top;
      if (!top) return;
      this.close(top.id);
    },

    clear() {
      this.stack = [];
      this._applyScrollLock();
    },

    // ========== NEW API ==========
    update(id: string, patch: Partial<OverlayLayer>) {
      const idx = this.stack.findIndex((l) => l.id === id);
      if (idx === -1) return;
      // patch "soft": re-normalizza solo i campi patchati, mantenendo prevActive/createdAt
      const prev = this.stack[idx];
      const normalized = this._normalize({ ...prev, ...patch, id });
      this.stack[idx] = {
        ...prev,
        ...normalized,
        createdAt: prev.createdAt,
        _prevActive: prev._prevActive,
      };
    },

    request(layer: OverlayLayer) {
      this.install();
      const incoming = this._normalize(layer);

      // suppression
      if (this.isSuppressed(incoming.kind)) return null;

      const top = this.top;

      // se non c'è nulla: applica behaviour e apri
      if (!top) {
        this._applyBehaviour(incoming);
        this._pushOrUpdate(incoming);
        return incoming.id;
      }

      // arbitration per priority
      const inP = incoming.priority ?? 0;
      const topP = top.priority ?? 0;

      if (inP > topP) {
        this._applyBehaviour(incoming);
        this._pushOrUpdate(incoming);
        // anti-bounce hover
        this.suppress("hoverbar", 300);
        return incoming.id;
      }

      if (inP === topP) {
        const sameIdentity =
          incoming.kind === top.kind &&
          incoming.identityKey &&
          top.identityKey &&
          incoming.identityKey === top.identityKey;

        if (sameIdentity && this.has(incoming.id)) {
          this.update(incoming.id, incoming);
          return incoming.id;
        }

        this._applyBehaviour(incoming);
        this._pushOrUpdate(incoming);
        return incoming.id;
      }

      // lower priority -> deny
      return null;
    },
    bind(binding: OverlayBinding) {
      this.install();
      this.bindings.set(binding.id, binding);
      // sync immediato
      this.sync(binding.id);
    },
    unbind(id: string) {
      this.bindings.delete(id);
      this.remove(id);
    },

    sync(id: string) {
      const b = this.bindings.get(id);
      if (!b) return;

      const open = b.isOpen();
      const mounted = this.has(id);

      if (open && !mounted) {
        // prova ad ammetterlo
        const granted = this.request({
          id: b.id,
          kind: b.kind,
          priority: b.priority,
          behaviour: b.behaviour,
          exclusiveKinds: b.exclusiveKinds,
          getMenuEl: b.getMenuEl,
          getAnchorEl: b.getAnchorEl,
          close: () => b.requestClose("programmatic"),
          options: b.options,
          identityKey: b.kind ? `${b.kind}:${b.id}` : b.id,
          interactionScope: b.interactionScope
            ? resolveScope(b.interactionScope)
            : "local",
        });
        if (!granted) {
          // denied: forzi chiusura (senza sapere come)
          b.requestClose("replace");
        }
        return;
      }

      if (!open && mounted) {
        // è stato chiuso dal sistema interno -> rimuovi layer
        this.remove(id);
      }
    },

    syncLive(id: string) {
      const b = this.bindings.get(id);
      if (!b) return;
      if (!this.has(id)) return;

      this.update(id, {
        kind: b.kind,
        priority: b.priority,
        behaviour: b.behaviour,
        exclusiveKinds: b.exclusiveKinds,
        keepKinds: b.keepKinds,
        identityKey: b.identityKey,

        getMenuEl: b.getMenuEl,
        getAnchorEl: b.getAnchorEl,
        options: b.options,

        interactionScope: b.getInteractionScope?.() ?? "local",
      });
    },

    _applyBehaviour(incoming: OverlayEntry) {
      const b = incoming.behaviour;

      if (b === "stack") return;

      if (b === "replaceLower") {
        const p = incoming.priority ?? 0;
        // rimuove quelli con priority inferiore
        this.stack = this.stack.filter((l) => (l.priority ?? 0) >= p);
        this._applyScrollLock();
        return;
      }

      if (b === "exclusiveKinds") {
        const kinds = new Set(incoming.exclusiveKinds ?? []);
        if (!kinds.size) return;

        const toKill = this.stack.filter((l) => l.kind && kinds.has(l.kind));

        for (const l of toKill) {
          if (l.kind === "dropdown") {
            this.close(l.id); // ✅ chiude davvero (callback + focus restore)
          } else {
            this.remove(l.id); // ✅ spegne silenzioso (hoverbar ecc.)
          }
        }
        return;

        /* if (kinds.size) {
          // per hover di solito remove (senza side effects). Qui scegliamo remove.
          this.stack = this.stack.filter(l => !l.kind || !kinds.has(l.kind))
          this._applyScrollLock()
        }
        return*/
      }

      if (b === "exclusiveAll") {
        const keep = new Set(incoming.keepKinds ?? []);
        // lascia solo i "keepKinds" se presenti
        this.stack = this.stack.filter((l) => l.kind && keep.has(l.kind));
        this._applyScrollLock();
        return;
      }
    },

    _pushOrUpdate(incoming: OverlayEntry) {
      // Se esiste già id, aggiorna in-place (evita flicker)
      const idx = this.stack.findIndex((l) => l.id === incoming.id);
      if (idx !== -1) {
        const prev = this.stack[idx];
        this.stack[idx] = {
          ...prev,
          ...incoming,
          _prevActive: prev._prevActive,
          createdAt: prev.createdAt,
        };
      } else {
        // de-dup by id come open()
        this.stack = this.stack.filter((l) => l.id !== incoming.id);
        this.stack.push(incoming);
      }
      this._applyScrollLock();
    },

    _applyScrollLock() {
      document.documentElement.classList.toggle(
        "overlay-scroll-locked",
        this.hasScrollLock,
      );
    },

    _onKeydown(e: KeyboardEvent) {
      const top = this.top;
      if (!top) return;
      if (e.key !== "Escape") return;
      if (!top.options.closeOnEsc) return;
      e.preventDefault();
      e.stopPropagation();
      this.closeTop();
    },

    _onPointerDown(e: PointerEvent) {
      const top = this.top;
      // console.log('[overlay] top', top?.id, top?.kind, 'scope=', top?.interactionScope)
      if (!top) return;

      const scope = resolveScope(top.interactionScope);
      const allowOutsidePointer = scope === "global";
      //allowOutsidePointer = true

      const menuEl = top.getMenuEl?.();
      if (!menuEl) return;

      const t = e.target instanceof Node ? e.target : null;
      if (t && menuEl.contains(t)) return;

      if (top.options.allowAnchorClick) {
        const anchorEl = top.getAnchorEl?.();
        if (t && anchorEl && anchorEl.contains?.(t)) return;
      }

      if (top.options.closeOnOutside && !allowOutsidePointer) {
        const isRightClick = e.button === 2;

        if (!isRightClick) {
          e.preventDefault();
          e.stopPropagation();
        }

        this.closeTop();
        return;
      }

      if (top.options.stopPointerOutside && !allowOutsidePointer) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
  },
});
