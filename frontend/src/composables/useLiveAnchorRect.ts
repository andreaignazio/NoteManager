// composables/useLiveAnchorRect.ts
import { computed, onBeforeUnmount, ref, unref, watch, type Ref } from "vue";

/**
 * Compatibile con:
 * - HTMLElement
 * - VirtualAnchor (qualsiasi oggetto con getBoundingClientRect())
 */
export type AnchorLike = {
  getBoundingClientRect: () => DOMRect;
} | null;

export type AnchorInput = AnchorLike | Ref<AnchorLike | undefined> | undefined;

export type AnchorRect = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export type UseLiveAnchorRectOpts = {
  /** se true, ascolta scroll in capture */
  captureScroll?: boolean;
};

function toAnchorRect(r: DOMRect): AnchorRect {
  return {
    top: r.top,
    left: r.left,
    right: r.right,
    bottom: r.bottom,
    width: r.width,
    height: r.height,
  };
}

function readRect(anchor: AnchorLike): AnchorRect | null {
  if (!anchor || typeof anchor.getBoundingClientRect !== "function")
    return null;
  const r = anchor.getBoundingClientRect();
  return toAnchorRect(r);
}

/**
 * Mantiene aggiornato l'AnchorRect per un anchor (HTMLElement o VirtualAnchor),
 * finché `enabled` è true. Si aggiorna su:
 * - resize window
 * - scroll window
 * - change dell'anchor
 *
 * @param anchorEl - HTMLElement | VirtualAnchor | ref<...>
 * @param enabled  - ref<boolean>
 * @param opts     - opzioni
 */
export default function useLiveAnchorRect(
  anchorEl: AnchorInput,
  enabled: Ref<boolean>,
  opts?: UseLiveAnchorRectOpts,
) {
  const rect = ref<AnchorRect | null>(null);

  let raf = 0;
  const captureScroll = opts?.captureScroll ?? true;

  const getEl = (): AnchorLike => unref(anchorEl) ?? null;

  const scheduleUpdate = () => {
    if (!enabled.value) return;
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      raf = 0;
      updateNow();
    });
  };

  const updateNow = () => {
    const el = getEl();
    if (!enabled.value || !el) {
      rect.value = null;
      return;
    }

    const r = readRect(el);
    if (!r) {
      rect.value = null;
      return;
    }

    // Se è "strano" e siamo attivi, riprova al prossimo frame
    const bad =
      !Number.isFinite(r.top) ||
      !Number.isFinite(r.left) ||
      (r.width === 0 && r.height === 0);

    if (bad) {
      rect.value = null;
      scheduleUpdate();
      return;
    }

    rect.value = r;
  };

  const onResize = () => scheduleUpdate();
  const onScroll = () => scheduleUpdate();

  const scrollOpts: AddEventListenerOptions = {
    passive: true,
    capture: captureScroll,
  };
  const resizeOpts: AddEventListenerOptions = { passive: true };

  const start = () => {
    updateNow();
    scheduleUpdate();
    window.addEventListener("resize", onResize, resizeOpts);
    window.addEventListener("scroll", onScroll, scrollOpts);
  };

  const stop = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    window.removeEventListener("resize", onResize, resizeOpts);
    window.removeEventListener("scroll", onScroll, scrollOpts);
    rect.value = null;
  };

  watch(
    enabled,
    (isOn) => {
      if (isOn) start();
      else stop();
    },
    { immediate: true },
  );

  watch(
    () => getEl(),
    () => {
      if (enabled.value) scheduleUpdate();
    },
  );

  onBeforeUnmount(() => stop());

  const anchorRect = computed<AnchorRect | null>(() =>
    enabled.value ? rect.value : null,
  );

  return { anchorRect, updateNow, scheduleUpdate };
}
