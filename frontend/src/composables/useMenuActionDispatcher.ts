import { useAppActions } from "@/actions/useAppActions";
import { useUIOverlayStore } from "@/stores/uioverlay";
import { useTempAnchors } from "@/actions/tempAnchors.actions";
import { useEditorRegistryStore } from "@/stores/editorRegistry";
import { useUiStore } from "@/stores/ui";
import { useBlocksStore } from "@/stores/blocks";
import { MENU_COMMANDS, type MenuActionPayload } from "@/domain/menuActions";

export function useMenuActionDispatcher() {
  const actions = useAppActions();
  const uiOverlay = useUIOverlayStore();
  const tempAnchors = useTempAnchors();
  const editorReg = useEditorRegistryStore();
  const ui = useUiStore();
  const blocksStore = useBlocksStore();

  const getBlockId = (a: MenuActionPayload & { type: "command" }) =>
    a.ctx.blockId ? String(a.ctx.blockId) : null;

  const getPageId = (a: MenuActionPayload & { type: "command" }) =>
    a.ctx.pageId ? String(a.ctx.pageId) : null;

  const commandHandlers: Record<
    string,
    (a: MenuActionPayload & { type: "command" }) => any
  > = {
    [MENU_COMMANDS.BLOCK_DUPLICATE]: async (a) => {
      const blockId = getBlockId(a);
      if (!blockId) return;
      await actions.blocks?.duplicateBlock?.(blockId);
    },
    [MENU_COMMANDS.BLOCK_DELETE]: async (a) => {
      const blockId = getBlockId(a);
      const pageId =
        getPageId(a) ??
        (blockId ? (blocksStore.blocksById?.[blockId]?.pageId ?? null) : null);
      if (!blockId || !pageId) return;

      const tmpanchor = tempAnchors.registerViewportCenter();
      try {
        await actions.blocks?.deleteBlockFlow?.({
          blockId,
          pageId,
          anchorKey: tmpanchor.key,
          placement: "center",
        });
      } finally {
        tmpanchor?.unregister();
      }
    },
    [MENU_COMMANDS.BLOCK_MOVE_TO_PAGE]: async (a) => {
      const blockId = getBlockId(a);
      if (!blockId) return;
      const tmpanchor = tempAnchors.registerViewportCenter();
      uiOverlay.requestOpen?.({
        menuId: "block.moveTo",
        anchorKey: tmpanchor.key,
        payload: {
          blockId,
          placement: "center",
        },
      });
    },
    [MENU_COMMANDS.BLOCK_APPLY_TYPE]: async (a) => {
      const blockId = getBlockId(a);
      const blockType = a.payload?.blockType;
      if (!blockId || !blockType) return;
      await actions.blocks?.setBlockType?.(blockId, blockType);
    },
    [MENU_COMMANDS.BLOCK_SET_TEXT_COLOR]: async (a) => {
      const blockId = getBlockId(a);
      const token = a.payload?.token;
      if (!blockId || !token) return;
      await actions.blocks?.setBlockTextColor?.(blockId, token);
    },
    [MENU_COMMANDS.BLOCK_SET_BG_COLOR]: async (a) => {
      const blockId = getBlockId(a);
      const token = a.payload?.token;
      if (!blockId || !token) return;
      await actions.blocks?.setBlockBgColor?.(blockId, token);
    },
    [MENU_COMMANDS.BLOCK_SET_FONT]: async (a) => {
      const blockId = getBlockId(a);
      const fontId = a.payload?.fontId;
      if (!blockId || !fontId) return;
      await actions.blocks?.setBlockFont?.(blockId, fontId);
    },

    [MENU_COMMANDS.EDITOR_COPY]: async (a) => {
      const blockId = getBlockId(a);
      if (!blockId) return;
      await actions.text.copyBlockRich(blockId);
    },
    [MENU_COMMANDS.EDITOR_PASTE]: async (a) => {
      const blockId = getBlockId(a);
      if (!blockId) return;
      await actions.text.pasteSmart(blockId);
    },
    [MENU_COMMANDS.EDITOR_BOLD]: async (a) => {
      const blockId = getBlockId(a);
      if (!blockId) return;
      actions.text.toggleBold(blockId);
    },
    [MENU_COMMANDS.EDITOR_ITALIC]: async (a) => {
      const blockId = getBlockId(a);
      if (!blockId) return;
      actions.text.toggleItalic(blockId);
    },
    [MENU_COMMANDS.EDITOR_STRIKE]: async (a) => {
      const blockId = getBlockId(a);
      if (!blockId) return;
      actions.text.toggleStrike(blockId);
    },
    [MENU_COMMANDS.EDITOR_UNDERLINE]: async (a) => {
      const blockId = getBlockId(a);
      if (!blockId) return;
      actions.text.toggleUnderline(blockId);
    },
    [MENU_COMMANDS.EDITOR_TOGGLE_CODE]: async (a) => {
      const blockId = getBlockId(a);
      if (!blockId) return;
      const ed = editorReg.getEditor(blockId);
      ed?.chain().focus().toggleCode().run();
    },
    [MENU_COMMANDS.EDITOR_OPEN_LINK]: async (a) => {
      const blockId = getBlockId(a);
      if (!blockId) return;
      const pageId = getPageId(a);
      const ed = editorReg.getEditor(blockId);
      const activeHref = ed ? actions.text.getActiveLinkHref(blockId) : null;

      const selectionAnchor = tempAnchors.registerSelection();
      const tmpanchor = selectionAnchor ?? tempAnchors.registerViewportCenter();

      uiOverlay.requestOpen?.({
        menuId: "commons.linkPopover",
        anchorKey: tmpanchor.key,
        payload: {
          blockId,
          pageId,
          currentPageId: pageId,
          initialHref: activeHref ?? "",
          cleanup: tmpanchor.unregister,
        },
      });
    },
    [MENU_COMMANDS.EDITOR_REMOVE_LINK]: async (a) => {
      const blockId = getBlockId(a);
      if (!blockId) return;
      actions.text.removeLinkInSelectionOrAtCaret(blockId);
    },
    [MENU_COMMANDS.EDITOR_TOGGLE_HIGHLIGHT]: async (a) => {
      const blockId = getBlockId(a);
      if (!blockId) return;
      const ed = editorReg.getEditor(blockId);
      if (!ed) return;
      const unset = !!a.payload?.unset;
      const color = a.payload?.color ?? ui.lastHighlightColor;
      if (unset) {
        ed.commands?.unsetHighlight?.();
        return;
      }
      ed.chain().focus().toggleHighlight({ color }).run();
    },
    [MENU_COMMANDS.EDITOR_SET_HIGHLIGHT]: async (a) => {
      const blockId = getBlockId(a);
      const color = a.payload?.color;
      if (!blockId || !color) return;
      ui.lastHighlightColor = color;
      const ed = editorReg.getEditor(blockId);
      ed?.chain().focus().toggleHighlight({ color }).run();
    },

    [MENU_COMMANDS.PAGE_CREATE_AFTER]: async (a) => {
      const pageId = getPageId(a);
      if (!pageId) return;
      await actions.pages.createPageAfterAndActivate(pageId);
    },
    [MENU_COMMANDS.PAGE_DUPLICATE]: async (a) => {
      const pageId = getPageId(a);
      if (!pageId) return;
      await actions.pages.duplicatePage(pageId);
    },
    [MENU_COMMANDS.PAGE_DELETE]: async (a) => {
      const pageId = getPageId(a);
      if (!pageId) return;
      const tmpanchor = tempAnchors.registerViewportCenter();
      try {
        await actions.pages.softDeletePageFlow({
          pageId,
          anchorKey: tmpanchor.key,
          placement: "center",
        });
      } finally {
        tmpanchor?.unregister();
      }
    },
    [MENU_COMMANDS.PAGE_RESTORE_TRASH]: async (a) => {
      const pageId = getPageId(a);
      if (!pageId) return;
      return actions.pages.restorePageFromTrashFlow(pageId);
    },
    [MENU_COMMANDS.PAGE_PURGE]: async (a) => {
      const pageId = getPageId(a);
      if (!pageId) return;
      return actions.pages.purgePageFromTrashFlow(pageId);
    },

    [MENU_COMMANDS.COPY_TO_CLIPBOARD]: async (a) => {
      const text = a.payload?.text ?? a.payload?.value ?? "";
      if (!text) return;
      await actions.utility.copyToClipboard(String(text));
    },
  };

  async function dispatchMenuAction(a: MenuActionPayload) {
    if (a.type === "openMenu") {
      uiOverlay.requestOpen?.({
        menuId: a.menuId,
        anchorKey: a.anchorKey ?? a.ctx.anchorKey!,
        payload: a.payload,
      });
      return;
    }

    if (a.type === "navigate") {
      return;
    }

    if (a.type === "command") {
      const fn = commandHandlers[a.command];
      if (fn) return fn(a);
      console.warn("[MenuDispatcher] Unhandled menu command:", a.command, a);
    }
  }

  return { dispatchMenuAction };
}

export default useMenuActionDispatcher;
