import usePagesStore from "@/stores/pages";
import router from "@/router";
import { useUiStore } from "@/stores/ui";
import { useUIOverlayStore } from "@/stores/uioverlay";

export function usePageActions() {
  const pagesStore = usePagesStore();
  const ui = useUiStore();
  const uiOverlay = useUIOverlayStore();

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
    await pagesStore.toggleFavoritePage(pageId);
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
    await pagesStore.movePageToParentAppend(pageId, newParentId);
    ui.setLastAddedPageId(pageId);
    redirectToPage(pageId);
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
    deletePageFlow,
  };
}
