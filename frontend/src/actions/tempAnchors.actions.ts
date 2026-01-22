import { onBeforeUnmount } from "vue";
import {
  useAnchorRegistryStore,
  type VirtualAnchor,
  type AnchorLike,
} from "@/stores/anchorRegistry";

type TempAnchorHandle = {
  key: string;
  unregister: () => void;
  update?: () => void;
};

function uid(prefix = "tmp") {
  return `${prefix}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

function domRectFromXY(x: number, y: number) {
  return new DOMRect(x, y, 1, 1);
}

/**
 * Helpers per ancore virtuali:
 * - point anchor (mouse/caret)
 * - viewport center
 * - selection anchor
 * - fixed rect anchor
 */
export function createPointAnchor(x: number, y: number): VirtualAnchor {
  return { getBoundingClientRect: () => domRectFromXY(x, y) };
}

export function createViewportCenterAnchor(): VirtualAnchor {
  return {
    getBoundingClientRect: () => {
      const x = window.innerWidth / 2;
      const y = window.innerHeight / 2;
      return domRectFromXY(x, y);
    },
  };
}

export function createFixedRectAnchor(rect: DOMRect): VirtualAnchor {
  return { getBoundingClientRect: () => rect };
}

/**
 * Anchor su selection range. Versione robusta: usa getClientRects e prende l'ultimo rect
 * (tipicamente l'estremità della selezione), fallback su getBoundingClientRect.
 */
export function createSelectionAnchor(): VirtualAnchor | null {
  const sel = window.getSelection?.();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (range.collapsed) return null;

  return {
    getBoundingClientRect: () => {
      const rects = Array.from(range.getClientRects?.() ?? []);
      const r = rects.length
        ? rects[rects.length - 1]
        : range.getBoundingClientRect();
      return new DOMRect(r.left, r.top, r.width, r.height);
    },
  };
}

/**
 * Composable che semplifica registrazione/unregistrazione di ancore temporanee.
 * - registra nel registry
 * - ti ritorna key + unregister
 * - cleanup automatico su unmount del chiamante (utile per componenti)
 */
export function useTempAnchors(opts?: {
  prefix?: string;
  autoCleanup?: boolean;
}) {
  const anchors = useAnchorRegistryStore();
  const prefix = opts?.prefix ?? "tmp";
  const autoCleanup = opts?.autoCleanup ?? true;

  const cleanups = new Set<() => void>();
  const track = (fn: () => void) => {
    cleanups.add(fn);
    return () => {
      cleanups.delete(fn);
      fn();
    };
  };

  function registerTemp(anchor: AnchorLike, key?: string): TempAnchorHandle {
    const k = key ?? uid(prefix);
    const unregister = anchors.registerAnchor(k, anchor);
    const un = track(unregister);
    return { key: k, unregister: un };
  }

  function registerPoint(x: number, y: number, key?: string) {
    return registerTemp(createPointAnchor(x, y), key);
  }

  function registerViewportCenter(key?: string) {
    return registerTemp(createViewportCenterAnchor(), key);
  }

  function registerSelection(key?: string) {
    const a = createSelectionAnchor();
    if (!a) return null;
    return registerTemp(a, key);
  }

  function registerFixedRect(rect: DOMRect, key?: string) {
    return registerTemp(createFixedRectAnchor(rect), key);
  }

  function cleanupAll() {
    for (const c of Array.from(cleanups)) c();
    cleanups.clear();
  }

  if (autoCleanup) {
    onBeforeUnmount(() => cleanupAll());
  }

  return {
    registerTemp,
    registerPoint,
    registerViewportCenter,
    registerSelection,
    registerFixedRect,
    cleanupAll,
  };
}
