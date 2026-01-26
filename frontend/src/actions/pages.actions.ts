import usePagesStore from "@/stores/pages";
import { useBlocksStore } from "@/stores/blocks";
import router from "@/router";
import { useUiStore } from "@/stores/ui";
import { useUIOverlayStore } from "@/stores/uioverlay";

export function usePageActions() {
  const pagesStore = usePagesStore();
  const blocksStore = useBlocksStore();
  const ui = useUiStore();
  const uiOverlay = useUIOverlayStore();

  const snapshotPage = (pageId: string | number) => {
    const p = pagesStore.pagesById?.[String(pageId)];
    if (!p) return null;
    return {
      id: String(p.id),
      title: p.title ?? "",
      parentId: p.parentId ?? null,
      position: String(p.position ?? ""),
      icon: p.icon ?? "",
      favorite: !!p.favorite,
      favorite_position: p.favorite_position ?? null,
    };
  };

  const patchFromSnapshot = (
    snap: ReturnType<typeof snapshotPage>,
    keys: string[],
  ) => {
    if (!snap) return {} as Record<string, any>;
    const out: Record<string, any> = {};
    for (const k of keys) {
      if (k === "parent") out.parent = snap.parentId;
      else if (k === "position") out.position = snap.position;
      else if (k === "title") out.title = snap.title;
      else if (k === "icon") out.icon = snap.icon;
      else if (k === "favorite") out.favorite = snap.favorite;
      else if (k === "favorite_position")
        out.favorite_position = snap.favorite_position;
    }
    return out;
  };

  async function createChildAndActivate(parentId: string) {
    const newPageId = await pagesStore.addChildPage(parentId);

    pagesStore.ensureVisible(newPageId);

    pagesStore.requestTitleFocus(newPageId);

    pagesStore.openPage(newPageId);

    ui.setLastAddedPageId(newPageId);

    ui.requestScrollToPage(newPageId);

    router.push({ name: "pageDetail", params: { id: newPageId } });
  }

  async function createPageAfterAndActivate(pageId: string) {
    const newPageId = await pagesStore.addPageAfterId(pageId);

    ui.setLastAddedPageId(newPageId);

    pagesStore.requestTitleFocus(newPageId);

    redirectToPage(newPageId);
  }

  async function redirectToPage(pageId: string) {
    pagesStore.ensureVisible(pageId);
    ui.requestScrollToPage(pageId);
    router.push({ name: "pageDetail", params: { id: pageId } });
  }

  async function duplicatePage(pageId: string) {
    const newId = await pagesStore.duplicatePageTransactional(pageId);
    ui.setLastAddedPageId(newId);
    redirectToPage(newId);
  }

  async function toggleFavoritePage(pageId: string) {
    const before = snapshotPage(pageId);
    const id = String(pageId);
    const page = pagesStore.pagesById?.[id];
    if (!page) return;

    const next = !page.favorite;
    page.favorite = next;
    try {
      await pagesStore.patchPage(id, { favorite: next });
      const after = snapshotPage(pageId);
      if (before && after) {
        pagesStore.pushUndoEntry({
          pageId: String(pageId),
          undo: patchFromSnapshot(before, ["favorite"]),
          redo: patchFromSnapshot(after, ["favorite"]),
          label: "toggleFavorite",
        });
      }
    } catch (e) {
      page.favorite = !next;
      throw e;
    }
    ui.setLastAddedPageId(pageId);
  }

  /*async function deletePage(pageId: string) {
    const hasChildren =
      pagesStore.hasChildren?.(pageId) ??
      (pagesStore.childrenByParentId?.[String(pageId)] ?? []).length > 0;
    const id = pageId;
    if (!id) return;

    try {
      const nextId = pagesStore.getNextPageIdAfterDelete?.(id);

      if (hasChildren.value && keepChildren.value) {
        try {
          await pagesStore.reparentChildrenToParent(id);
        } catch (e) {
          console.error("[PageActions] reparentChildrenToParent failed", e);
          throw e;
        }
      }

      try {
        await pagesStore.deletePage(id);
      } catch (e) {
        console.error("[PageActions] deletePage failed", e);
        throw e;
      }

      if (nextId) router.push({ name: "pageDetail", params: { id: nextId } });
      else router.push("/");
    } catch (e) {
      console.error("[PageActions] DELETE FLOW FAILED", e);
    } finally {
      console.groupEnd();
    }
  }*/

  async function movePageToParentAppend(pageId: string, newParentId: string) {
    const before = snapshotPage(pageId);
    await pagesStore.movePageToParentAppend(pageId, newParentId);
    const after = snapshotPage(pageId);
    if (before && after) {
      pagesStore.pushUndoEntry({
        pageId: String(pageId),
        undo: patchFromSnapshot(before, ["parent", "position"]),
        redo: patchFromSnapshot(after, ["parent", "position"]),
        label: "movePage",
      });
    }
    ui.setLastAddedPageId(pageId);
    redirectToPage(pageId);
  }

  async function openPageAndLoadBlocks(pageId: string | number) {
    await pagesStore.openPage(pageId);
    await blocksStore.fetchBlocksForPage(pageId);
  }

  async function fetchPages() {
    await pagesStore.fetchPages();
  }

  function ensureVisible(pageId: string | number | null) {
    pagesStore.ensureVisible(pageId as any);
  }

  function cancelEdit() {
    pagesStore.cancelEdit();
  }

  function requestTitleFocus(pageId: string | number) {
    pagesStore.requestTitleFocus(pageId as any);
  }

  function consumeTitleFocusRequest(pageId: string | number) {
    pagesStore.consumeTitleFocusRequest?.(pageId as any);
  }

  function openPage(pageId: string | number) {
    pagesStore.openPage(pageId as any);
  }

  async function deletePage(pageId: string | number) {
    await pagesStore.deletePage(pageId as any);
  }

  async function patchPage(
    pageId: string | number,
    payload: Record<string, any>,
    opts?: {
      undo?: boolean;
      label?: string;
      before?: ReturnType<typeof snapshotPage>;
    },
  ) {
    const keys = Object.keys(payload ?? {});
    const before = opts?.undo ? (opts?.before ?? snapshotPage(pageId)) : null;

    const res = await pagesStore.patchPage(String(pageId), payload);

    if (opts?.undo && before && keys.length) {
      const after = snapshotPage(pageId);
      if (after) {
        pagesStore.pushUndoEntry({
          pageId: String(pageId),
          undo: patchFromSnapshot(before, keys),
          redo: patchFromSnapshot(after, keys),
          label: opts.label ?? "patchPage",
        });
      }
    }

    return res;
  }

  function toggleExpandPage(pageId: string | number) {
    pagesStore.toggleExpandPage(pageId as any);
  }

  function updatePageLocationOptimistic(
    pageId: string | number,
    params: { newParentId: string | number | null; newPosition: string },
  ) {
    pagesStore.updatePageLocationOptimistic(pageId as any, params);
  }

  function updatePageTitleOptimistic(pageId: string | number, title: string) {
    const id = String(pageId);
    if (pagesStore.pagesById?.[id]) {
      pagesStore.pagesById[id].title = title;
    }
  }

  function updatePageIconOptimistic(pageId: string | number, icon: string) {
    const id = String(pageId);
    if (pagesStore.pagesById?.[id]) {
      pagesStore.pagesById[id].icon = icon;
    }
  }

  function updatePageFavoritePositionOptimistic(
    pageId: string | number,
    position: string,
  ) {
    const id = String(pageId);
    if (pagesStore.pagesById?.[id]) {
      pagesStore.pagesById[id].favorite_position = position;
    }
  }

  async function reparentChildrenToParent(pageId: string | number) {
    await pagesStore.reparentChildrenToParent(pageId as any);
  }

  async function undoLastEntry() {
    await pagesStore.undoLastEntry();
  }

  async function redoLastEntry() {
    await pagesStore.redoLastEntry();
  }

  async function movePageWithUndo(args: {
    pageId: string | number;
    newParentId: string | number | null;
    newPosition: string;
  }) {
    const before = snapshotPage(args.pageId);
    updatePageLocationOptimistic(args.pageId, {
      newParentId: args.newParentId,
      newPosition: args.newPosition,
    });

    await patchPage(
      args.pageId,
      { parent: args.newParentId, position: String(args.newPosition) },
      { undo: true, label: "movePage", before },
    );
  }

  async function updateFavoritePositionWithUndo(
    pageId: string | number,
    position: string,
  ) {
    const before = snapshotPage(pageId);
    updatePageFavoritePositionOptimistic(pageId, position);
    await patchPage(
      pageId,
      { favorite_position: position },
      { undo: true, label: "favoritePosition", before },
    );
  }

  async function updatePageMetaWithUndo(args: {
    pageId: string | number;
    title?: string;
    icon?: string;
  }) {
    const before = snapshotPage(args.pageId);
    if (args.title !== undefined)
      updatePageTitleOptimistic(args.pageId, args.title);
    if (args.icon !== undefined)
      updatePageIconOptimistic(args.pageId, args.icon);

    const payload: Record<string, any> = {};
    if (args.title !== undefined) payload.title = args.title;
    if (args.icon !== undefined) payload.icon = args.icon;

    await patchPage(args.pageId, payload, {
      undo: true,
      label: "pageMeta",
      before,
    });
  }
  function routePageId() {
    const id = router.currentRoute.value?.params?.id;
    return id != null ? String(id) : null;
  }

  function isRouteOnPage(pageId: string | number) {
    const cur = routePageId();
    return cur != null && cur === String(pageId);
  }

  async function deletePageFlow(opts: {
    pageId: string | number;
    anchorKey: string;
    placement?: string;
  }) {
    const pageId = String(opts.pageId);

    const hasChildren =
      pagesStore.hasChildren?.(pageId) ??
      (pagesStore.childrenByParentId?.[String(pageId)] ?? []).length > 0;

    const res = await uiOverlay.requestConfirm({
      menuId: "page.deleteConfirm",
      anchorKey: opts.anchorKey,
      payload: {
        title: "Delete page?",
        message: hasChildren
          ? "This will delete the page and its subpages."
          : "This will delete the page.",
        confirmText: "Delete",
        cancelText: "Cancel",
        danger: true,
        checkbox: hasChildren
          ? { label: "Keep subpages (move to parent)", defaultValue: true }
          : null,
      },
    });

    if (!res.ok) return { ok: false as const, reason: res.reason };

    const keepChildren = !!res.value?.keepChildren;

    // scegli nextId prima di mutare
    const nextId = pagesStore.getNextPageIdAfterDelete?.(pageId) ?? null;

    if (hasChildren && keepChildren) {
      await pagesStore.reparentChildrenToParent(pageId);
    }

    await pagesStore.deletePage(pageId);

    // se la route era su quella page, naviga
    if (isRouteOnPage(pageId)) {
      if (nextId) router.push({ name: "pageDetail", params: { id: nextId } });
      else router.push("/");
    }

    return { ok: true as const, nextId };
  }

  return {
    createChildAndActivate,
    redirectToPage,
    createPageAfterAndActivate,
    duplicatePage,
    toggleFavoritePage,
    /*deletePage,*/
    movePageToParentAppend,
    movePageWithUndo,
    openPageAndLoadBlocks,
    fetchPages,
    ensureVisible,
    cancelEdit,
    requestTitleFocus,
    consumeTitleFocusRequest,
    openPage,
    deletePage,
    patchPage,
    toggleExpandPage,
    updatePageLocationOptimistic,
    updatePageTitleOptimistic,
    updatePageIconOptimistic,
    updatePageFavoritePositionOptimistic,
    updateFavoritePositionWithUndo,
    updatePageMetaWithUndo,
    reparentChildrenToParent,
    undoLastEntry,
    redoLastEntry,
    deletePageFlow,
  };
}
