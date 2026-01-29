import DragHandle from "@tiptap/extension-drag-handle";

type DragHandlePlusOptions = {
  onPlus?: (payload: { pos: number; node: any | null }) => void;
  onMenu?: (payload: {
    pos: number;
    node: any | null;
    anchorEl: HTMLElement;
  }) => void;
  onNodeChange?: (payload: {
    editor: any;
    node: any | null;
    pos: number;
  }) => void;
  className?: string;
  nested?: boolean | object;
  computePositionConfig?: Record<string, any>;
  hitAreaWidth?: number;
};

export function createDragHandlePlusExtension(opts: DragHandlePlusOptions) {
  let currentPos = -1;
  let currentNode: any | null = null;
  let allowDrag = false;
  let editorRef: any | null = null;
  let isLocked = false;
  let cleanupMouse: (() => void) | null = null;

  const getHitAreaWidth = (editor: any) => {
    if (typeof opts.hitAreaWidth === "number") return opts.hitAreaWidth;
    const raw = editor?.view?.dom
      ? getComputedStyle(editor.view.dom).getPropertyValue("--doc-gutter-hit")
      : "";
    const parsed = parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : 28;
  };

  const getPrimaryBlockRect = (editor: any, pos: number) => {
    try {
      const dom = editor?.view?.nodeDOM?.(pos);
      if (!(dom instanceof HTMLElement)) return null;
      const content = dom.querySelector(".doc-item-content");
      const primary = content?.querySelector(
        ":scope > :not(.doc-item)",
      ) as HTMLElement | null;
      const target = primary ?? (content as HTMLElement) ?? dom;
      if (!target) return null;
      const rect = target.getBoundingClientRect();
      if (!Number.isFinite(rect.top) || rect.height <= 0) return null;
      return rect;
    } catch {
      return null;
    }
  };

  const updateLockFromMouse = (event: MouseEvent) => {
    if (!editorRef || currentPos < 0) {
      if (isLocked) {
        editorRef?.commands?.unlockDragHandle?.();
        isLocked = false;
      }
      return;
    }

    const rect = getPrimaryBlockRect(editorRef, currentPos);
    if (!rect) {
      if (isLocked) {
        editorRef?.commands?.unlockDragHandle?.();
        isLocked = false;
      }
      return;
    }

    const width = getHitAreaWidth(editorRef);
    const left = rect.left - width;
    const within =
      event.clientX >= left &&
      event.clientX <= rect.left &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;

    if (within && !isLocked) {
      editorRef?.commands?.lockDragHandle?.();
      isLocked = true;
      return;
    }

    if (!within && isLocked) {
      editorRef?.commands?.unlockDragHandle?.();
      isLocked = false;
    }
  };

  return DragHandle.configure({
    nested: opts.nested ?? true,
    computePositionConfig: opts.computePositionConfig ?? {},
    onNodeChange: (payload: {
      editor: any;
      node: any | null;
      pos?: number;
    }) => {
      currentPos = payload?.pos ?? -1;
      currentNode = payload?.node ?? null;
      if (!editorRef && payload?.editor) {
        editorRef = payload.editor;
        const dom = editorRef?.view?.dom;
        if (dom && !cleanupMouse) {
          const onMove = (event: MouseEvent) => updateLockFromMouse(event);
          const onLeave = () => {
            if (isLocked) {
              editorRef?.commands?.unlockDragHandle?.();
              isLocked = false;
            }
          };
          dom.addEventListener("mousemove", onMove, true);
          dom.addEventListener("mouseleave", onLeave, true);
          cleanupMouse = () => {
            dom.removeEventListener("mousemove", onMove, true);
            dom.removeEventListener("mouseleave", onLeave, true);
          };
          editorRef?.on?.("destroy", () => {
            cleanupMouse?.();
            cleanupMouse = null;
          });
        }
      }
      opts.onNodeChange?.({
        editor: payload?.editor,
        node: payload?.node ?? null,
        pos: payload?.pos ?? -1,
      });
    },
    render: () => {
      const root = document.createElement("div");
      root.className = opts.className ?? "doc-drag-handle";

      root.addEventListener(
        "dragstart",
        (event) => {
          if (!allowDrag) {
            console.log("[DnD] handle dragstart blocked", {
              allowDrag,
              target: event.target,
            });
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
          }
          console.log("[DnD] handle dragstart", {
            allowDrag,
            target: event.target,
          });
          if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.dropEffect = "move";
          }
        },
        true,
      );

      root.addEventListener(
        "dragover",
        (event) => {
          console.log("[DnD] handle dragover", { target: event.target });
          if (event.dataTransfer) {
            event.dataTransfer.dropEffect = "move";
          }
        },
        true,
      );

      root.addEventListener(
        "drop",
        (event) => {
          console.log("[DnD] handle drop", { target: event.target });
          if (event.dataTransfer) {
            event.dataTransfer.dropEffect = "move";
          }
        },
        true,
      );

      root.addEventListener(
        "dragend",
        () => {
          console.log("[DnD] handle dragend");
          allowDrag = false;
        },
        true,
      );

      const grip = document.createElement("button");
      grip.type = "button";
      grip.className = "doc-drag-grip";
      grip.textContent = "⋮⋮";
      grip.addEventListener("pointerdown", () => {
        console.log("[DnD] grip pointerdown", { pos: currentPos });
        allowDrag = true;
      });
      grip.addEventListener("pointerup", () => {
        console.log("[DnD] grip pointerup", { pos: currentPos });
        allowDrag = false;
      });
      grip.addEventListener("pointerleave", () => {
        console.log("[DnD] grip pointerleave", { pos: currentPos });
        allowDrag = false;
      });
      grip.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (currentPos < 0) return;
        opts.onMenu?.({ pos: currentPos, node: currentNode, anchorEl: grip });
      });

      const plus = document.createElement("button");
      plus.type = "button";
      plus.className = "doc-drag-plus";
      plus.textContent = "+";
      plus.addEventListener("mousedown", (e) => e.preventDefault());
      plus.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (currentPos < 0) return;
        opts.onPlus?.({ pos: currentPos, node: currentNode });
      });

      root.append(plus, grip);
      return root;
    },
  });
}

export default createDragHandlePlusExtension;
