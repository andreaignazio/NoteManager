import DragHandle from "@tiptap/extension-drag-handle";
import { NodeSelection, TextSelection } from "prosemirror-state";
import { Fragment } from "prosemirror-model";
import { posBetween } from "@/domain/position";
import { useUIOverlayStore } from "@/stores/uioverlay";
import { useAnchorRegistryStore } from "@/stores/anchorRegistry";
import { anchorKey } from "@/ui/anchorsKeyBind";

type SimpleDragHandleOptions = {
  className?: string;
  nested?: boolean | object;
  computePositionConfig?: Record<string, any>;
  allowInside?: boolean;
  insideDelay?: number;
};

export function createSimpleDragHandleExtension(
  opts: SimpleDragHandleOptions = {},
) {
  let editorRef: any | null = null;
  let currentPos = -1;
  let isDragging = false;
  let dragPointerId: number | null = null;
  let draggedPos = -1;
  let currentIntent:
    | { kind: "none" }
    | { kind: "line"; where: "top" | "bottom"; targetPos: number }
    | { kind: "inside"; targetPos: number } = { kind: "none" };

  let lineEl: HTMLDivElement | null = null;
  let insideEl: HTMLDivElement | null = null;
  let hoverTimer: number | null = null;
  let lastTargetPos = -1;
  let lastMode: "line" | "inside" | null = null;
  let lastLineWhere: "top" | "bottom" = "bottom";
  let handleRoot: HTMLElement | null = null;
  let dragHandleEl: HTMLElement | null = null;
  let dragMoved = false;
  let dragStartPoint: { x: number; y: number } | null = null;
  let dragMenuAnchorKey: string | null = null;
  let dragMenuAnchorCleanup: null | (() => void) = null;
  let overlayUnsubscribe: null | (() => void) = null;
  const DRAG_MENU_ID = "block.menu";
  const DRAG_ANCHOR_KIND = "block:dragHandle:blockRow:gutter";
  let ghostEl: HTMLElement | null = null;
  let ghostOffset = { x: 0, y: 0 };
  let ghostSourceEl: HTMLElement | null = null;
  let ghostRect: DOMRect | null = null;
  let currentBlockSize: string | null = null;
  let currentBlockType: string | null = null;
  const normalizeBlockSize = (blockType: string | null | undefined) => {
    if (blockType === "h1" || blockType === "h2" || blockType === "h3") {
      return blockType;
    }
    return "p";
  };

  const allowInside = opts.allowInside !== false;
  const insideDelay = Number.isFinite(opts.insideDelay)
    ? Math.max(0, Number(opts.insideDelay))
    : 220;

  const normalizeItemId = (value: unknown): string | null => {
    if (value == null) return null;
    const str = String(value).trim();
    return str ? str : null;
  };

  const normalizeItemPosition = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const str = value.trim();
    return str ? str : null;
  };

  const makeItemId = (): string => {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `id_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  };

  const ensureItemId = (tr: any, pos: number, node: any) => {
    const existing = normalizeItemId(node?.attrs?.id ?? null);
    if (existing) return existing;
    const nextId = makeItemId();
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, id: nextId });
    return nextId;
  };

  const findItemById = (
    doc: any,
    id: string | null,
  ): { node: any; pos: number } | null => {
    if (!id) return null;
    let found: { node: any; pos: number } | null = null;
    doc.descendants((node: any, pos: number) => {
      if (node?.type?.name !== "draggableItem") return true;
      const nodeId = normalizeItemId(node.attrs?.id ?? null);
      if (nodeId === id) {
        found = { node, pos };
        return false;
      }
      return true;
    });
    return found;
  };

  const wouldCreateCycle = (
    doc: any,
    currentId: string | null,
    candidateParentId: string | null,
  ) => {
    if (!currentId || !candidateParentId) return false;
    if (String(currentId) === String(candidateParentId)) return true;
    let cursor = String(candidateParentId);
    const seen = new Set<string>();
    while (cursor) {
      if (seen.has(cursor)) return true;
      seen.add(cursor);
      const ref = findItemById(doc, cursor) as {
        node: any;
        pos: number;
      } | null;
      const next = normalizeItemId(ref?.node?.attrs?.parentId ?? null);
      if (!next) return false;
      if (String(next) === String(currentId)) return true;
      cursor = String(next);
    }
    return false;
  };

  const getSiblingsByParent = (doc: any, parentId: string | null) => {
    const key = normalizeItemId(parentId);
    const out: Array<{ node: any; pos: number }> = [];
    doc.descendants((node: any, pos: number) => {
      if (node?.type?.name !== "draggableItem") return true;
      const pid = normalizeItemId(node.attrs?.parentId ?? null);
      if (pid === key) out.push({ node, pos });
      return true;
    });
    return out;
  };

  const sortSiblingsByPosition = (items: Array<{ node: any; pos: number }>) =>
    items.slice().sort((a, b) => {
      const pa = normalizeItemPosition(a.node.attrs?.position ?? null);
      const pb = normalizeItemPosition(b.node.attrs?.position ?? null);
      if (pa && pb && pa !== pb) return pa < pb ? -1 : 1;
      if (pa && !pb) return -1;
      if (!pa && pb) return 1;
      return a.pos - b.pos;
    });

  const buildChildrenIndex = (nodes: any[]) => {
    const byId = new Map<string, any>();
    nodes.forEach((node) => {
      const id = normalizeItemId(node?.attrs?.id ?? null);
      if (id) byId.set(id, node);
    });

    const childrenByParent = new Map<string, string[]>();
    nodes.forEach((node) => {
      const id = normalizeItemId(node?.attrs?.id ?? null);
      if (!id) return;
      let parentId = normalizeItemId(node?.attrs?.parentId ?? null);
      if (!parentId || !byId.has(parentId) || parentId === id) {
        parentId = "__root__";
      }
      if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
      childrenByParent.get(parentId)?.push(id);
    });

    return { byId, childrenByParent };
  };

  const collectSubtreeIds = (
    rootId: string,
    childrenByParent: Map<string, string[]>,
  ) => {
    const out: string[] = [];
    const visit = (id: string) => {
      out.push(id);
      const kids = childrenByParent.get(id) ?? [];
      kids.forEach(visit);
    };
    visit(rootId);
    return out;
  };

  const clearHoverTimer = () => {
    if (hoverTimer) {
      window.clearTimeout(hoverTimer);
      hoverTimer = null;
    }
  };

  const emitSyncEvent = (type: "doc-sync-pause" | "doc-sync-resume") => {
    const pageId = editorRef?.view?.dom?.getAttribute?.("data-doc-page-id");
    if (!pageId) return;
    window.dispatchEvent(
      new CustomEvent(type, { detail: { pageId: String(pageId) } }),
    );
  };

  const cleanupDragMenuAnchor = () => {
    dragMenuAnchorCleanup?.();
    dragMenuAnchorCleanup = null;
    dragMenuAnchorKey = null;
  };

  const ensureOverlaySubscription = () => {
    if (overlayUnsubscribe) return;
    const uiOverlay = useUIOverlayStore();
    overlayUnsubscribe = uiOverlay.$subscribe((_mutation, state) => {
      const active = state.activeRequestByMenuId?.[DRAG_MENU_ID] ?? null;
      if (
        !active ||
        (dragMenuAnchorKey && active.anchorKey !== dragMenuAnchorKey)
      ) {
        cleanupDragMenuAnchor();
      }
    });
  };

  const openDragHandleMenu = (anchorEl: HTMLElement | null) => {
    const view = editorRef?.view;
    if (!view || !anchorEl || currentPos < 0) return;

    const pageId = view.dom?.getAttribute?.("data-doc-page-id") ?? null;
    if (!pageId) return;

    const docNodeId = `docnode:${currentPos}`;
    const key = anchorKey(DRAG_ANCHOR_KIND, docNodeId);

    cleanupDragMenuAnchor();
    dragMenuAnchorKey = key;
    dragMenuAnchorCleanup = useAnchorRegistryStore().registerAnchor(
      key,
      anchorEl,
    );
    ensureOverlaySubscription();

    useUIOverlayStore().requestOpen({
      menuId: DRAG_MENU_ID,
      anchorKey: key,
      payload: {
        pageId,
        docNodeId,
        placement: "right-start",
      },
    });
  };

  const startDragVisuals = (event: PointerEvent) => {
    document.documentElement.classList.add("doc-dragging");
    const view = editorRef?.view;
    if (!view || currentPos < 0) return;
    ghostSourceEl = getItemDomAtPos(view, currentPos);
    if (!ghostSourceEl) return;

    ghostRect = ghostSourceEl.getBoundingClientRect();
    ghostOffset = {
      x: event.clientX - ghostRect.left,
      y: event.clientY - ghostRect.top,
    };
  };

  const updateDragVisuals = (event: PointerEvent) => {
    if (!ghostEl && ghostSourceEl && ghostRect) {
      ghostEl = ghostSourceEl.cloneNode(true) as HTMLElement;
      ghostEl.classList.add("doc-drag-ghost");
      ghostEl.style.position = "fixed";
      ghostEl.style.left = `${Math.round(ghostRect.left)}px`;
      ghostEl.style.top = `${Math.round(ghostRect.top)}px`;
      ghostEl.style.width = `${Math.round(ghostRect.width)}px`;
      ghostEl.style.height = `${Math.round(ghostRect.height)}px`;
      ghostEl.style.pointerEvents = "none";
      ghostEl.style.margin = "0";
      document.body.appendChild(ghostEl);
    }
    if (!ghostEl) return;
    const left = event.clientX - ghostOffset.x;
    const top = event.clientY - ghostOffset.y;
    ghostEl.style.left = `${Math.round(left)}px`;
    ghostEl.style.top = `${Math.round(top)}px`;
  };

  const stopDragVisuals = () => {
    document.documentElement.classList.remove("doc-dragging");
    if (ghostEl) ghostEl.remove();
    ghostEl = null;
    ghostSourceEl = null;
    ghostRect = null;
  };

  const ensureOverlays = () => {
    if (!lineEl) {
      lineEl = document.createElement("div");
      lineEl.className = "doc-drop-line";
      document.body.appendChild(lineEl);
    }
    if (!insideEl) {
      insideEl = document.createElement("div");
      insideEl.className = "doc-drop-inside";
      document.body.appendChild(insideEl);
    }
  };

  const hideOverlays = () => {
    if (lineEl) lineEl.style.opacity = "0";
    if (insideEl) insideEl.style.opacity = "0";
  };

  const showLineAt = (rowRect: DOMRect, where: "top" | "bottom") => {
    if (!lineEl) return;
    const inset = 10;
    const y = where === "top" ? rowRect.top : rowRect.bottom;
    lineEl.style.left = `${rowRect.left + inset}px`;
    lineEl.style.width = `${Math.max(0, rowRect.width - inset * 2)}px`;
    lineEl.style.top = `${y}px`;
    lineEl.style.opacity = "1";
  };

  const showInsideAt = (itemRect: DOMRect) => {
    if (!insideEl) return;
    insideEl.style.left = `${itemRect.left + 6}px`;
    insideEl.style.width = `${Math.max(0, itemRect.width - 12)}px`;
    insideEl.style.top = `${itemRect.top}px`;
    insideEl.style.height = `${itemRect.height}px`;
    insideEl.style.opacity = "1";
  };

  const getDraggableItemPosAtCoords = (view: any, x: number, y: number) => {
    if (!view?.posAtCoords) return null;
    const hit = view.posAtCoords({ left: x, top: y });
    if (!hit) return null;
    const $pos = view.state.doc.resolve(hit.pos);
    for (let d = $pos.depth; d > 0; d -= 1) {
      const node = $pos.node(d);
      if (node?.type?.name === "draggableItem") {
        return $pos.before(d);
      }
    }
    return null;
  };

  const getFirstLastDraggablePos = (view: any) => {
    if (!view?.state?.doc) return { first: null, last: null };
    const { doc } = view.state;
    let first: number | null = null;
    let last: number | null = null;
    doc.descendants((node: any, pos: number) => {
      if (node?.type?.name !== "draggableItem") return true;
      if (first == null) first = pos;
      last = pos;
      return true;
    });
    return { first, last };
  };

  const getItemDomAtPos = (view: any, pos: number) => {
    if (!view?.nodeDOM) return null;
    const dom = view.nodeDOM(pos);
    if (dom instanceof HTMLElement) {
      if (dom.classList.contains("doc-item")) return dom;
      const closest = dom.closest?.(".doc-item") ?? null;
      return closest instanceof HTMLElement ? closest : null;
    }
    return null;
  };

  const getRowRect = (itemEl: HTMLElement) => {
    const contentEl = itemEl.querySelector(":scope > .doc-item-content");
    if (!contentEl) return itemEl.getBoundingClientRect();
    const children = Array.from(contentEl.children);
    const main = children.find((el) => !el.classList.contains("doc-item"));
    const rectTarget =
      (main instanceof HTMLElement && main) ||
      (contentEl instanceof HTMLElement ? contentEl : itemEl);
    return rectTarget.getBoundingClientRect();
  };

  const computeIntent = (
    itemEl: HTMLElement,
    rowRect: DOMRect,
    x: number,
    y: number,
    forceLine: boolean,
  ) => {
    const EDGE = 0.2;
    const yRel = rowRect.height ? (y - rowRect.top) / rowRect.height : 0;
    const insideAllowed = allowInside && !forceLine;

    if (insideAllowed && yRel > EDGE && yRel < 1 - EDGE) {
      return { mode: "inside" as const };
    }

    const mid = rowRect.top + rowRect.height / 2;
    const DEAD = 6;
    if (y < mid - DEAD) return { mode: "line" as const, where: "top" as const };
    if (y > mid + DEAD)
      return { mode: "line" as const, where: "bottom" as const };
    return { mode: "line" as const, where: lastLineWhere };
  };

  const setCurrentIntent = (
    mode: "inside" | "line",
    targetPos: number,
    where: "top" | "bottom" = "bottom",
  ) => {
    if (mode === "inside") {
      currentIntent = { kind: "inside", targetPos };
      return;
    }
    currentIntent = { kind: "line", where, targetPos };
  };

  const startTracking = () => {
    ensureOverlays();
    hideOverlays();
    currentIntent = { kind: "none" };
    lastTargetPos = -1;
    lastMode = null;
    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("pointercancel", onPointerUp, true);
  };

  const stopTracking = () => {
    document.removeEventListener("pointermove", onPointerMove, true);
    document.removeEventListener("pointerup", onPointerUp, true);
    document.removeEventListener("pointercancel", onPointerUp, true);
    clearHoverTimer();
    hideOverlays();
    lastTargetPos = -1;
    lastMode = null;
  };

  const commitIntent = () => {
    const view = editorRef?.view;
    if (!view || !currentIntent || currentIntent.kind === "none") return;
    const { state } = view;
    const draggedNode = state.doc.nodeAt(draggedPos);
    if (!draggedNode || draggedNode.type?.name !== "draggableItem") return;

    const targetPos = currentIntent.targetPos;
    if (!Number.isFinite(targetPos) || targetPos < 0) return;
    if (targetPos === draggedPos) return;

    const targetNode = state.doc.nodeAt(targetPos);
    if (!targetNode || targetNode.type?.name !== "draggableItem") return;

    const draggedFrom = draggedPos;
    const draggedTo = draggedPos + draggedNode.nodeSize;
    if (targetPos >= draggedFrom && targetPos < draggedTo) return;

    const tr = state.tr;
    const draggedId = ensureItemId(tr, draggedPos, draggedNode);
    let targetItemId = normalizeItemId(targetNode.attrs?.id ?? null);
    if (!targetItemId) {
      targetItemId = makeItemId();
      tr.setNodeMarkup(targetPos, undefined, {
        ...targetNode.attrs,
        id: targetItemId,
      });
    }

    let newParentId: string | null = null;
    let prevSiblingPos: string | null = null;
    let nextSiblingPos: string | null = null;

    if (currentIntent.kind === "inside") {
      newParentId = targetItemId;
      const siblings = sortSiblingsByPosition(
        getSiblingsByParent(state.doc, newParentId).filter(
          (s) => s.pos !== draggedPos,
        ),
      );
      const last = siblings[siblings.length - 1] ?? null;
      prevSiblingPos = last
        ? normalizeItemPosition(last.node.attrs?.position ?? null)
        : null;
      nextSiblingPos = null;
    } else {
      newParentId = normalizeItemId(targetNode.attrs?.parentId ?? null);
      const siblings = sortSiblingsByPosition(
        getSiblingsByParent(state.doc, newParentId).filter(
          (s) => s.pos !== draggedPos,
        ),
      );
      const targetIdx = siblings.findIndex(
        (s) =>
          s.pos === targetPos ||
          normalizeItemId(s.node.attrs?.id) === targetItemId,
      );
      if (currentIntent.where === "top") {
        const prev = targetIdx > 0 ? siblings[targetIdx - 1] : null;
        const next = targetIdx >= 0 ? siblings[targetIdx] : null;
        prevSiblingPos = prev
          ? normalizeItemPosition(prev.node.attrs?.position ?? null)
          : null;
        nextSiblingPos = next
          ? normalizeItemPosition(next.node.attrs?.position ?? null)
          : null;
      } else {
        const prev = targetIdx >= 0 ? siblings[targetIdx] : null;
        const next = targetIdx >= 0 ? siblings[targetIdx + 1] : null;
        prevSiblingPos = prev
          ? normalizeItemPosition(prev.node.attrs?.position ?? null)
          : null;
        nextSiblingPos = next
          ? normalizeItemPosition(next.node.attrs?.position ?? null)
          : null;
      }
    }

    if (wouldCreateCycle(state.doc, draggedId, newParentId)) return;

    const nextPosition = posBetween(prevSiblingPos, nextSiblingPos);
    const updatedNode = draggedNode.type.create(
      {
        ...draggedNode.attrs,
        id: draggedId,
        parentId: newParentId ?? null,
        position: nextPosition,
      },
      draggedNode.content,
    );

    let insertPos = 0;
    if (currentIntent.kind === "inside") {
      insertPos = targetPos + targetNode.nodeSize - 1;
    } else {
      insertPos =
        currentIntent.where === "top"
          ? targetPos
          : targetPos + targetNode.nodeSize;
    }

    const deleteFrom = draggedFrom;
    const deleteTo = draggedTo;
    const deletedSize = deleteTo - deleteFrom;
    if (deleteFrom < insertPos) insertPos -= deletedSize;

    if (insertPos < 0) return;

    const deleteTr = tr.delete(deleteFrom, deleteTo);
    deleteTr.insert(insertPos, updatedNode);

    if (!deleteTr.docChanged) return;

    const list: any[] = [];
    deleteTr.doc.content.forEach((node: any) => list.push(node));

    const { byId, childrenByParent } = buildChildrenIndex(list);
    const draggedSubtree = collectSubtreeIds(draggedId, childrenByParent);
    const draggedSet = new Set(draggedSubtree);

    const updatedList = list.map((node) => {
      const id = normalizeItemId(node?.attrs?.id ?? null);
      if (id && id === draggedId) return updatedNode;
      return node;
    });

    const removed = updatedList.filter((node) => {
      const id = normalizeItemId(node?.attrs?.id ?? null);
      return !(id && draggedSet.has(id));
    });

    const targetNodeId = normalizeItemId(targetNode.attrs?.id ?? null);
    const targetSubtreeIds = targetNodeId
      ? collectSubtreeIds(targetNodeId, childrenByParent)
      : [];
    const targetSet = new Set(targetSubtreeIds);

    const targetIndex = removed.findIndex((node) => {
      const id = normalizeItemId(node?.attrs?.id ?? null);
      return id && id === targetNodeId;
    });
    const lastTargetIndex = removed.reduce((acc, node, idx) => {
      const id = normalizeItemId(node?.attrs?.id ?? null);
      if (id && targetSet.has(id)) return idx;
      return acc;
    }, -1);

    let insertIndex = removed.length;
    if (currentIntent.kind === "inside") {
      insertIndex = lastTargetIndex >= 0 ? lastTargetIndex + 1 : removed.length;
    } else if (currentIntent.where === "top") {
      insertIndex = targetIndex >= 0 ? targetIndex : removed.length;
    } else {
      insertIndex = lastTargetIndex >= 0 ? lastTargetIndex + 1 : removed.length;
    }

    const subtreeNodes = updatedList.filter((node) => {
      const id = normalizeItemId(node?.attrs?.id ?? null);
      return id && draggedSet.has(id);
    });

    const finalList = removed
      .slice(0, insertIndex)
      .concat(subtreeNodes)
      .concat(removed.slice(insertIndex));

    const nextTr = deleteTr.replaceWith(
      0,
      deleteTr.doc.content.size,
      Fragment.fromArray(finalList),
    );

    let offset = 0;
    let selectionAnchorPos = 0;
    finalList.forEach((node: any) => {
      const id = normalizeItemId(node.attrs?.id ?? null);
      if (id && id === draggedId) {
        selectionAnchorPos = offset;
      }
      offset += node.nodeSize;
    });

    nextTr.setSelection(
      TextSelection.near(nextTr.doc.resolve(selectionAnchorPos + 1)),
    );
    view.dispatch(nextTr.scrollIntoView());
  };

  const onPointerMove = (event: PointerEvent) => {
    if (
      !isDragging ||
      (dragPointerId != null && event.pointerId !== dragPointerId)
    ) {
      return;
    }

    event.preventDefault();

    if (!dragMoved && dragStartPoint) {
      const dx = event.clientX - dragStartPoint.x;
      const dy = event.clientY - dragStartPoint.y;
      if (dx * dx + dy * dy > 9) {
        dragMoved = true;
      }
    }

    if (ghostEl) {
      updateDragVisuals(event);
    }
    if (dragMoved && !ghostEl) {
      updateDragVisuals(event);
    }

    const view = editorRef?.view;
    if (!view) return;

    const x = event.clientX;
    const y = event.clientY;

    let targetPos = getDraggableItemPosAtCoords(view, x, y);
    if (typeof targetPos !== "number") {
      const { first, last } = getFirstLastDraggablePos(view);
      if (first == null || last == null) {
        clearHoverTimer();
        hideOverlays();
        currentIntent = { kind: "none" };
        return;
      }
      const containerRect = view.dom?.getBoundingClientRect?.();
      const isAbove = containerRect ? y < containerRect.top : false;
      const isBelow = containerRect ? y > containerRect.bottom : false;
      if (isAbove) {
        targetPos = first;
        lastLineWhere = "top";
      } else if (isBelow) {
        targetPos = last;
        lastLineWhere = "bottom";
      } else {
        targetPos = first;
        lastLineWhere = "top";
      }
    }

    if (targetPos === draggedPos) {
      clearHoverTimer();
      hideOverlays();
      currentIntent = { kind: "none" };
      return;
    }

    const itemEl = getItemDomAtPos(view, targetPos);
    if (!itemEl) {
      clearHoverTimer();
      hideOverlays();
      currentIntent = { kind: "none" };
      return;
    }

    const rowRect = getRowRect(itemEl);
    const intent = computeIntent(itemEl, rowRect, x, y, !!event.altKey);

    if (lastTargetPos !== targetPos) {
      clearHoverTimer();
      lastMode = null;
      hideOverlays();
    }

    lastTargetPos = targetPos;

    if (intent.mode === "inside") {
      if (!allowInside) return;
      if (lastMode === "inside") return;
      lastMode = "inside";

      setCurrentIntent("inside", targetPos);
      if (lineEl) lineEl.style.opacity = "0";

      clearHoverTimer();
      hoverTimer = window.setTimeout(() => {
        if (lastTargetPos === targetPos && lastMode === "inside") {
          showInsideAt(itemEl.getBoundingClientRect());
        }
      }, insideDelay);
      return;
    }

    const where = intent.where;
    if (lastMode === "line" && where === lastLineWhere) return;
    lastMode = "line";
    lastLineWhere = where;

    clearHoverTimer();
    if (insideEl) insideEl.style.opacity = "0";
    setCurrentIntent("line", targetPos, where);
    showLineAt(rowRect, where);
  };

  const insertSiblingAfter = () => {
    const view = editorRef?.view;
    if (!view || currentPos < 0) return;
    const { state } = view;
    const currentNode = state.doc.nodeAt(currentPos);
    if (!currentNode || currentNode.type?.name !== "draggableItem") return;

    const insertPos = currentPos + currentNode.nodeSize;
    const baseAttrs = currentNode.attrs ?? {};
    const attrs = { ...baseAttrs };
    if (attrs.listType === "ordered") {
      attrs.listStart = null;
    }

    const parentId = normalizeItemId(currentNode.attrs?.parentId ?? null);
    const siblings = sortSiblingsByPosition(
      getSiblingsByParent(state.doc, parentId).filter(
        (s) => s.pos !== currentPos,
      ),
    );
    const selfPos = normalizeItemPosition(currentNode.attrs?.position ?? null);
    const selfIdx = siblings.findIndex(
      (s) =>
        normalizeItemId(s.node.attrs?.id) ===
        normalizeItemId(currentNode.attrs?.id),
    );
    const nextSibling = selfIdx >= 0 ? siblings[selfIdx + 1] : null;
    const nextSiblingPos = nextSibling
      ? normalizeItemPosition(nextSibling.node.attrs?.position ?? null)
      : null;
    const nextPosition = posBetween(selfPos, nextSiblingPos);

    const paragraph = state.schema.nodes.paragraph.create();
    const newNode = state.schema.nodes.draggableItem.create(
      {
        ...attrs,
        id: makeItemId(),
        parentId: parentId ?? null,
        position: nextPosition,
      },
      [paragraph],
    );

    const tr = state.tr.insert(insertPos, newNode);
    if (!tr.docChanged) return;
    const selectionPos = insertPos + 1;
    tr.setSelection(TextSelection.near(tr.doc.resolve(selectionPos)));
    view.dispatch(tr.scrollIntoView());
  };

  const onPointerUp = (event: PointerEvent) => {
    if (
      !isDragging ||
      (dragPointerId != null && event.pointerId !== dragPointerId)
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    const wasClick = !dragMoved;

    stopTracking();
    if (!wasClick) {
      commitIntent();
    }
    emitSyncEvent("doc-sync-resume");

    isDragging = false;
    dragPointerId = null;
    draggedPos = -1;
    dragMoved = false;
    dragStartPoint = null;
    currentIntent = { kind: "none" };

    stopDragVisuals();

    if (wasClick) {
      openDragHandleMenu(dragHandleEl);
    }
    dragHandleEl = null;
  };

  return DragHandle.configure({
    nested: opts.nested ?? true,
    computePositionConfig: opts.computePositionConfig ?? {},
    onNodeChange: (payload: { editor: any; pos?: number }) => {
      if (!editorRef && payload?.editor) {
        editorRef = payload.editor;
        editorRef?.on?.("destroy", () => {
          cleanupDragMenuAnchor();
          overlayUnsubscribe?.();
          overlayUnsubscribe = null;
        });
      }

      const rawPos = typeof payload?.pos === "number" ? payload.pos : -1;
      if (!editorRef || rawPos < 0) {
        currentPos = -1;
        currentBlockSize = normalizeBlockSize("p");
        currentBlockType = "p";
        if (handleRoot) {
          handleRoot.setAttribute("data-block-size", currentBlockSize);
          handleRoot.setAttribute("data-block-type", currentBlockType);
        }
        return;
      }

      try {
        const $pos = editorRef.state.doc.resolve(rawPos);
        let depth = -1;
        for (let d = $pos.depth; d > 0; d -= 1) {
          if ($pos.node(d)?.type?.name === "draggableItem") {
            depth = d;
            break;
          }
        }

        if (depth > 0) {
          currentPos = $pos.before(depth);
          const node = $pos.node(depth);
          const blockType = node?.attrs?.blockType ?? "p";
          currentBlockType = String(blockType);
          currentBlockSize = normalizeBlockSize(blockType);
        } else {
          currentPos = rawPos;
          const node = editorRef.state?.doc?.nodeAt?.(rawPos) ?? null;
          const blockType = node?.attrs?.blockType ?? "p";
          currentBlockType = String(blockType);
          currentBlockSize = normalizeBlockSize(blockType);
        }
      } catch {
        currentPos = rawPos;
        currentBlockSize = normalizeBlockSize("p");
        currentBlockType = "p";
      }

      if (handleRoot) {
        handleRoot.setAttribute("data-block-size", currentBlockSize);
        handleRoot.setAttribute("data-block-type", currentBlockType ?? "p");
      }
    },
    render: () => {
      const root = document.createElement("div");
      root.className = opts.className ?? "doc-simple-handle";
      root.draggable = false;
      handleRoot = root;
      root.setAttribute("data-block-size", currentBlockSize ?? "p");
      root.setAttribute("data-block-type", currentBlockType ?? "p");
      root.addEventListener(
        "dragstart",
        (event) => {
          event.preventDefault();
          event.stopImmediatePropagation();
        },
        true,
      );

      const grip = document.createElement("button");
      grip.type = "button";
      grip.className = "doc-simple-grip";
      grip.textContent = "⋮⋮";
      grip.draggable = false;
      grip.addEventListener(
        "dragstart",
        (event) => {
          event.preventDefault();
          event.stopImmediatePropagation();
        },
        true,
      );
      grip.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();

        const view = editorRef?.view;
        if (!view || currentPos < 0) return;

        dragHandleEl = event.currentTarget as HTMLElement;
        dragMoved = false;
        dragStartPoint = { x: event.clientX, y: event.clientY };
        startDragVisuals(event);

        try {
          const selection = NodeSelection.create(view.state.doc, currentPos);
          view.dispatch(view.state.tr.setSelection(selection));
        } catch {
          // ignore
        }

        isDragging = true;
        dragPointerId = event.pointerId;
        draggedPos = currentPos;
        emitSyncEvent("doc-sync-pause");
        startTracking();
      });

      const plus = document.createElement("button");
      plus.type = "button";
      plus.className = "doc-simple-plus";
      plus.textContent = "+";
      plus.draggable = false;
      plus.addEventListener(
        "dragstart",
        (event) => {
          event.preventDefault();
          event.stopImmediatePropagation();
        },
        true,
      );
      plus.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        insertSiblingAfter();
      });

      root.appendChild(plus);
      root.appendChild(grip);
      return root;
    },
  });
}

export default createSimpleDragHandleExtension;
