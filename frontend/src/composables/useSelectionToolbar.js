import { ref, onMounted, onBeforeUnmount, nextTick } from "vue";

export function useSelectionToolbar(editorRef, opts = {}) {
  const OFFSET_Y = opts.offsetY ?? 20;
  const VIEWPORT_MARGIN = opts.viewportMargin ?? 8;
  const floatingEl = opts.floatingEl; // ref DOM

  const isOpen = ref(false);
  const x = ref(0);
  const y = ref(0);

  let raf = 0;
  let raf2 = 0;

  function close() {
    cancelAnimationFrame(raf);
    cancelAnimationFrame(raf2);
    isOpen.value = false;
  }

  function getHalfSize() {
    //console.log("floatingEl:", floatingEl)
    const el = floatingEl?.value;
    //console.log("el:", el)
    if (!el) return { halfW: 0, h: 0 };
    const r = el.getBoundingClientRect();
    return { halfW: r.width / 2, h: r.height };
  }

  function getSize() {
    const el = floatingEl?.value;
    if (!el) return { w: 0, h: 0 };
    return { w: el.offsetWidth || 0, h: el.offsetHeight || 0 };
  }

  function clampWithSize(nextX, nextY) {
    const vw = window.innerWidth;
    const { halfW, h } = getHalfSize();

    // clamp X considerando metà larghezza reale
    nextX = Math.max(
      VIEWPORT_MARGIN + halfW,
      Math.min(vw - VIEWPORT_MARGIN - halfW, nextX),
    );

    // clamp Y (toolbar sopra: translateY(-100%))
    const topOfBox = nextY - h;
    if (topOfBox < VIEWPORT_MARGIN) nextY = VIEWPORT_MARGIN + h;

    return { nextX, nextY };
  }

  function clamp(nextX, nextY) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const { w, h } = getSize();

    const halfW = w / 2;

    // se la toolbar è più larga del viewport, centrala e amen
    const minX = VIEWPORT_MARGIN + halfW;
    const maxX = vw - VIEWPORT_MARGIN - halfW;

    if (w === 0) {
      // fallback base
      nextX = Math.max(VIEWPORT_MARGIN, Math.min(vw - VIEWPORT_MARGIN, nextX));
    } else if (minX > maxX) {
      nextX = vw / 2;
    } else {
      nextX = Math.max(minX, Math.min(maxX, nextX));
    }

    // Y: la toolbar sta sopra (translateY(-100%)), quindi top = y - h
    if (h > 0) {
      const topOfBox = nextY - h;
      if (topOfBox < VIEWPORT_MARGIN) nextY = VIEWPORT_MARGIN + h;
    } else {
      nextY = Math.max(VIEWPORT_MARGIN, nextY);
    }

    return { nextX, nextY };
  }

  function compute({ allowSecondPass = true } = {}) {
    // console.log("ToolbarSelect: compute")
    const editor = editorRef.value;
    if (!editor || editor.isDestroyed) return close();

    const { state, view } = editor;
    //if (!view?.hasFocus()) return close()
    const active = document.activeElement;
    const focusOk =
      view?.hasFocus?.() || (active && view.dom && view.dom.contains(active));
    if (!focusOk) {
      // opzionale: non chiudere subito, dai 1 frame di grazia
      return requestAnimationFrame(() => {
        const a2 = document.activeElement;
        const ok2 =
          view?.hasFocus?.() || (a2 && view.dom && view.dom.contains(a2));
        if (!ok2) close();
      });
    }

    if (typeof opts.shouldShow === "function") {
      const ok = !!opts.shouldShow({ editor, state, view });
      if (!ok) return close();
    }

    const { from, to } = state.selection;
    if (from === to) return close();

    const start = view.coordsAtPos(from);
    const end = view.coordsAtPos(to);

    let nextX = (start.left + end.right) / 2;
    let nextY = Math.min(start.top, end.top) - OFFSET_Y;

    const anchorRect = {
      left: Math.min(start.left, end.left),
      right: Math.max(start.right, end.right),
      top: Math.min(start.top, end.top),
      bottom: Math.max(start.bottom, end.bottom),
      width: Math.max(1, Math.abs(end.right - start.left)),
      height: Math.max(1, Math.abs(end.bottom - start.top)),
    };

    if (typeof opts.onAnchorRect === "function") {
      opts.onAnchorRect(anchorRect);
    }

    // 1) apri subito (serve per far esistere il DOM in Teleport/Transition)
    isOpen.value = true;

    x.value = nextX;
    y.value = nextY;

    cancelAnimationFrame(raf2);
    raf2 = requestAnimationFrame(() => {
      const clamped = clamp(nextX, nextY);
      x.value = clamped.nextX;
      y.value = clamped.nextY;
    });

    // clamp con dimensione reale
    const clamped = clampWithSize(nextX, nextY);
    x.value = clamped.nextX;
    y.value = clamped.nextY;
  }

  function scheduleCompute() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => compute());
  }

  onMounted(() => {
    const onCommit = () => {
      //console.log('[selectionToolbar] EVENT commit received')
      scheduleCompute();
    };
    const onClear = () => {
      //console.log('[selectionToolbar] EVENT clear received')
      close();
    };

    window.addEventListener("selection-toolbar:commit", onCommit);
    window.addEventListener("selection-toolbar:clear", onClear);

    onBeforeUnmount(() => {
      window.removeEventListener("selection-toolbar:commit", onCommit);
      window.removeEventListener("selection-toolbar:clear", onClear);
      cancelAnimationFrame(raf);
      cancelAnimationFrame(raf2);
    });
  });

  return { isOpen, x, y, close };
}
