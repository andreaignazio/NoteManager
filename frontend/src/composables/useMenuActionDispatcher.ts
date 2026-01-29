import { useAppActions } from "@/actions/useAppActions";
import { useDocActions } from "@/actions/doc.actions";
import { useUIOverlayStore } from "@/stores/uioverlay";
import { useTempAnchors } from "@/actions/tempAnchors.actions";
import { useEditorRegistryStore } from "@/stores/editorRegistry";
import { useUiStore } from "@/stores/ui";
import { MENU_COMMANDS, type MenuActionPayload } from "@/domain/menuActions";

export function useMenuActionDispatcher() {
  const actions = useAppActions();
  const docActions = useDocActions();
  const uiOverlay = useUIOverlayStore();
  const tempAnchors = useTempAnchors();
  const editorReg = useEditorRegistryStore();
  const ui = useUiStore();

  const getDocNodeId = (a: MenuActionPayload & { type: "command" }) =>
    a.ctx.docNodeId ? String(a.ctx.docNodeId) : null;

  const getPageId = (a: MenuActionPayload & { type: "command" }) =>
    a.ctx.pageId ? String(a.ctx.pageId) : null;

  const isDocContext = (a: MenuActionPayload & { type: "command" }) => {
    const docNodeId = getDocNodeId(a);
    return !!docNodeId;
  };

  const getDocEditor = (a: MenuActionPayload & { type: "command" }) => {
    if (!isDocContext(a)) return null;
    const pageId = getPageId(a);
    if (!pageId) return null;
    const editorByDocKey = editorReg.getEditor(`doc:${pageId}`);
    if (editorByDocKey) return editorByDocKey;
    return editorReg.getEditor(pageId);
  };

  const findDraggableItemPosById = (ed: any, itemId: string) => {
    if (!ed?.state?.doc || !itemId) return null;
    let found: number | null = null;
    ed.state.doc.descendants((node: any, pos: number) => {
      if (node?.type?.name !== "draggableItem") return true;
      const id = node.attrs?.id != null ? String(node.attrs.id) : "";
      if (id && id === String(itemId)) {
        found = pos;
        return false;
      }
      return true;
    });
    return found;
  };

  const getDraggableItemPos = (ed: any, docNodeId?: string | null) => {
    if (docNodeId == null) return null;
    if (typeof docNodeId === "number") {
      return Number.isFinite(docNodeId) ? docNodeId : null;
    }
    const rawId = String(docNodeId);
    if (rawId.startsWith("docnode:")) {
      const raw = rawId.slice("docnode:".length);
      const pos = Number(raw);
      return Number.isFinite(pos) ? pos : null;
    }
    return findDraggableItemPosById(ed, rawId);
  };

  const getDraggableItemAttrsAtPos = (ed: any, pos: number | null) => {
    if (!ed || typeof pos !== "number") return null;
    const node = ed.state.doc.nodeAt(pos);
    if (!node || node.type.name !== "draggableItem") return null;
    return node.attrs ?? {};
  };

  const updateDraggableItemAttrsAtPos = (
    ed: any,
    pos: number | null,
    attrs: Record<string, any>,
  ) => {
    if (!ed || typeof pos !== "number") return false;
    const node = ed.state.doc.nodeAt(pos);
    if (!node || node.type.name !== "draggableItem") return false;
    const nextAttrs = { ...node.attrs, ...attrs };
    const tr = ed.state.tr.setNodeMarkup(pos, node.type, nextAttrs);
    ed.view.dispatch(tr);
    return true;
  };

  const logCommand = (
    command: string,
    a: MenuActionPayload & { type: "command" },
  ) => {
    console.log("[MenuCommand]", {
      command,
      docNodeId: a.ctx.docNodeId ?? null,
      blockId: a.ctx.blockId ?? null,
      pageId: a.ctx.pageId ?? null,
      payload: a.payload ?? null,
    });
  };

  const applyDocBlockType = (
    ed: any,
    blockType: string,
    docNodeId?: string | null,
  ) => {
    console.log(
      "[MenuDispatcher] applyDocBlockType:",
      "ed:",
      ed,
      "blockType:",
      blockType,
      "docNodeId:",
      docNodeId,
    );
    if (!ed) return;
    const pos = getDraggableItemPos(ed, docNodeId ?? null);
    const attrs = getDraggableItemAttrsAtPos(ed, pos) ?? {};
    const listType = attrs.listType ?? null;

    if (
      blockType === "inherit" ||
      blockType === "p" ||
      blockType === "h1" ||
      blockType === "h2" ||
      blockType === "h3" ||
      blockType === "quote" ||
      blockType === "code" ||
      blockType === "divider" ||
      blockType === "todo"
    ) {
      return updateDraggableItemAttrsAtPos(ed, pos, {
        blockType,
        listType: null,
        listStart: null,
      });
    }
    if (blockType === "ul") {
      if (listType === "bullet") return;
      return updateDraggableItemAttrsAtPos(ed, pos, {
        blockType: "p",
        listType: "bullet",
        listStart: null,
      });
    }
    if (blockType === "ol") {
      if (listType === "ordered") return;
      return updateDraggableItemAttrsAtPos(ed, pos, {
        blockType: "p",
        listType: "ordered",
        listStart: null,
      });
    }
  };

  const applyDocTextColor = (
    ed: any,
    textColor: string | null,
    docNodeId?: string | null,
  ) => {
    if (!ed) return;
    const pos = getDraggableItemPos(ed, docNodeId ?? null);
    return updateDraggableItemAttrsAtPos(ed, pos, {
      textColor: textColor || null,
    });
  };

  const applyDocBgColor = (
    ed: any,
    bgColor: string | null,
    docNodeId?: string | null,
  ) => {
    if (!ed) return;
    const pos = getDraggableItemPos(ed, docNodeId ?? null);
    return updateDraggableItemAttrsAtPos(ed, pos, {
      bgColor: bgColor || null,
    });
  };

  const applyDocFont = (
    ed: any,
    fontId: string | null,
    docNodeId?: string | null,
  ) => {
    if (!ed) return;
    const pos = getDraggableItemPos(ed, docNodeId ?? null);
    return updateDraggableItemAttrsAtPos(ed, pos, {
      font: fontId || "default",
    });
  };

  const runDocCommand = (ed: any, command: string) => {
    if (!ed?.commands?.[command]) return false;
    ed.commands?.focus?.();
    ed.commands[command]();
    return true;
  };

  const getDocSelectionText = (ed: any) => {
    if (!ed?.state?.selection) return "";
    const { from, to } = ed.state.selection;
    if (from === to) return "";
    return ed.state.doc.textBetween(from, to, "\n") ?? "";
  };

  const escapeSelector = (value: string) => {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
      return CSS.escape(value);
    }
    return String(value).replace(/"/g, '\\"');
  };

  const findDocItemEl = (ed: any, docNodeId: string | null) => {
    if (!docNodeId) return null;
    const raw = String(docNodeId);
    if (!raw.startsWith("docnode:")) {
      const selector = `.doc-item[data-id="${escapeSelector(raw)}"]`;
      return document.querySelector(selector) as HTMLElement | null;
    }
    const posRaw = raw.slice("docnode:".length);
    const pos = Number(posRaw);
    if (!Number.isFinite(pos)) return null;
    const dom = ed?.view?.nodeDOM?.(pos) ?? null;
    if (!dom) return null;
    const el =
      dom instanceof HTMLElement ? dom : (dom as HTMLElement).parentElement;
    return el?.closest?.(".doc-item") ?? (el as HTMLElement | null);
  };

  const getNodeText = (node: any) => {
    if (!node) return "";
    if (typeof node.textBetween === "function") {
      return node.textBetween(0, node.content.size, "\n") ?? "";
    }
    return node.textContent ?? "";
  };

  const getSelectionInNode = (ed: any, nodePos: number, nodeSize: number) => {
    const { from, to } = ed.state.selection;
    if (typeof from !== "number" || typeof to !== "number") return false;
    const nodeStart = nodePos;
    const nodeEnd = nodePos + nodeSize;
    return from >= nodeStart && to <= nodeEnd;
  };

  const commandHandlers: Record<
    string,
    (a: MenuActionPayload & { type: "command" }) => any
  > = {
    [MENU_COMMANDS.BLOCK_DUPLICATE]: async (a) => {
      logCommand(MENU_COMMANDS.BLOCK_DUPLICATE, a);
      const docEditor = getDocEditor(a);
      if (docEditor) {
        const pageId = getPageId(a);
        const pos = getDraggableItemPos(docEditor, getDocNodeId(a));
        if (!pageId || typeof pos !== "number") return;
        return docActions.duplicateNodeAtPos(pageId, pos);
      }
    },
    [MENU_COMMANDS.BLOCK_DELETE]: async (a) => {
      logCommand(MENU_COMMANDS.BLOCK_DELETE, a);
      const docEditor = getDocEditor(a);
      if (!docEditor) return;
      const pageId = getPageId(a);
      const pos = getDraggableItemPos(docEditor, getDocNodeId(a));
      if (!pageId || typeof pos !== "number") return;
      await docActions.deleteNodeAtPos(pageId, pos);
    },
    [MENU_COMMANDS.BLOCK_MOVE_TO_PAGE]: async (a) => {
      logCommand(MENU_COMMANDS.BLOCK_MOVE_TO_PAGE, a);
      const docEditor = getDocEditor(a);
      if (docEditor) {
        const pageId = getPageId(a);
        const docNodeId = getDocNodeId(a);
        if (!pageId || !docNodeId) return;
        const tmpanchor = tempAnchors.registerViewportCenter();
        uiOverlay.requestOpen?.({
          menuId: "block.moveTo",
          anchorKey: tmpanchor.key,
          payload: {
            pageId: String(pageId),
            docNodeId,
            placement: "center",
          },
        });
        return;
      }
    },
    [MENU_COMMANDS.BLOCK_OPEN_COMMENT]: async (a) => {
      logCommand(MENU_COMMANDS.BLOCK_OPEN_COMMENT, a);
      const pageId = getPageId(a);
      const docNodeId = getDocNodeId(a);
      if (!pageId || !docNodeId) return;

      const docEditor = getDocEditor(a);
      const targetEl = findDocItemEl(docEditor, String(docNodeId));

      const tempAnchor = targetEl
        ? tempAnchors.registerTemp(targetEl)
        : tempAnchors.registerViewportCenter();

      uiOverlay.requestOpen?.({
        menuId: "block.comment",
        anchorKey: tempAnchor.key,
        payload: {
          pageId,
          docNodeId: String(docNodeId),
          cleanup: tempAnchor.unregister,
        },
      });
    },
    [MENU_COMMANDS.BLOCK_APPLY_TYPE]: async (a) => {
      logCommand(MENU_COMMANDS.BLOCK_APPLY_TYPE, a);
      const blockType = a.payload?.blockType;
      if (!blockType) return;

      const docEditor = getDocEditor(a);
      console.log("[MenuDispatcher] BLOCK_APPLY_TYPE docEditor:", docEditor);
      if (docEditor) {
        return applyDocBlockType(docEditor, blockType, getDocNodeId(a));
      }
    },
    [MENU_COMMANDS.BLOCK_SET_TEXT_COLOR]: async (a) => {
      logCommand(MENU_COMMANDS.BLOCK_SET_TEXT_COLOR, a);
      const token = a.payload?.token ?? null;
      const docEditor = getDocEditor(a);
      if (docEditor) {
        return applyDocTextColor(docEditor, token, getDocNodeId(a));
      }
    },
    [MENU_COMMANDS.BLOCK_SET_BG_COLOR]: async (a) => {
      logCommand(MENU_COMMANDS.BLOCK_SET_BG_COLOR, a);
      const token = a.payload?.token ?? null;
      const docEditor = getDocEditor(a);
      if (docEditor) {
        return applyDocBgColor(docEditor, token, getDocNodeId(a));
      }
    },
    [MENU_COMMANDS.BLOCK_SET_FONT]: async (a) => {
      logCommand(MENU_COMMANDS.BLOCK_SET_FONT, a);
      const fontId = a.payload?.fontId ?? null;
      const docEditor = getDocEditor(a);
      if (docEditor) {
        return applyDocFont(docEditor, fontId, getDocNodeId(a));
      }
    },

    [MENU_COMMANDS.EDITOR_COPY]: async (a) => {
      logCommand(MENU_COMMANDS.EDITOR_COPY, a);
      const docEditor = getDocEditor(a);
      if (docEditor) {
        const docNodeId = getDocNodeId(a);
        const pos = getDraggableItemPos(docEditor, docNodeId);
        console.log("[DocCopy] docNodeId", docNodeId, "pos", pos);
        if (typeof pos === "number") {
          const node = docEditor.state.doc.nodeAt(pos);
          if (node) {
            const selectionText = getDocSelectionText(docEditor);
            const inSameNode = getSelectionInNode(
              docEditor,
              pos,
              node.nodeSize,
            );
            const textToCopy =
              inSameNode && selectionText ? selectionText : getNodeText(node);
            if (!textToCopy) return;
            await actions.utility.copyToClipboard(String(textToCopy));
            return;
          }
        }

        const fallbackText = getDocSelectionText(docEditor);
        if (!fallbackText) return;
        await actions.utility.copyToClipboard(String(fallbackText));
        return;
      }
    },
    [MENU_COMMANDS.EDITOR_PASTE]: async (a) => {
      logCommand(MENU_COMMANDS.EDITOR_PASTE, a);
      const docEditor = getDocEditor(a);
      if (docEditor) {
        try {
          const text = await navigator.clipboard.readText();
          if (!text) return;
          const docNodeId = getDocNodeId(a);
          const pos = getDraggableItemPos(docEditor, docNodeId);
          if (typeof pos === "number") {
            const node = docEditor.state.doc.nodeAt(pos);
            if (node) {
              const inSameNode = getSelectionInNode(
                docEditor,
                pos,
                node.nodeSize,
              );
              if (!inSameNode) {
                const insertPos = pos + node.nodeSize - 1;
                docEditor
                  .chain()
                  .focus()
                  .insertContentAt(insertPos, text)
                  .run();
                return;
              }
            }
          }
          docEditor.chain().focus().insertContent(text).run();
        } catch (err) {
          console.warn("[MenuDispatcher] paste failed", err);
        }
        return;
      }
      return;
    },
    [MENU_COMMANDS.EDITOR_BOLD]: async (a) => {
      logCommand(MENU_COMMANDS.EDITOR_BOLD, a);
      const docEditor = getDocEditor(a);
      if (docEditor) {
        return runDocCommand(docEditor, "toggleBold");
      }
      return;
    },
    [MENU_COMMANDS.EDITOR_ITALIC]: async (a) => {
      logCommand(MENU_COMMANDS.EDITOR_ITALIC, a);
      const docEditor = getDocEditor(a);
      if (docEditor) {
        return runDocCommand(docEditor, "toggleItalic");
      }
      return;
    },
    [MENU_COMMANDS.EDITOR_STRIKE]: async (a) => {
      logCommand(MENU_COMMANDS.EDITOR_STRIKE, a);
      const docEditor = getDocEditor(a);
      if (docEditor) {
        return runDocCommand(docEditor, "toggleStrike");
      }
      return;
    },
    [MENU_COMMANDS.EDITOR_UNDERLINE]: async (a) => {
      logCommand(MENU_COMMANDS.EDITOR_UNDERLINE, a);
      const docEditor = getDocEditor(a);
      if (docEditor) {
        return runDocCommand(docEditor, "toggleUnderline");
      }
      return;
    },
    [MENU_COMMANDS.EDITOR_TOGGLE_CODE]: async (a) => {
      logCommand(MENU_COMMANDS.EDITOR_TOGGLE_CODE, a);
      const docEditor = getDocEditor(a);
      if (docEditor) {
        return runDocCommand(docEditor, "toggleCode");
      }
      return;
    },
    [MENU_COMMANDS.EDITOR_OPEN_LINK]: async (a) => {
      logCommand(MENU_COMMANDS.EDITOR_OPEN_LINK, a);
      const docEditor = getDocEditor(a);
      if (docEditor) {
        const pageId = getPageId(a);
        if (!pageId) return;
        const activeHref = docEditor.getAttributes?.("link")?.href ?? null;

        const selectionAnchor = tempAnchors.registerSelection();
        const tmpanchor =
          selectionAnchor ?? tempAnchors.registerViewportCenter();

        uiOverlay.requestOpen?.({
          menuId: "commons.linkPopover",
          anchorKey: tmpanchor.key,
          payload: {
            docKey: `doc:${pageId}`,
            docNodeId: getDocNodeId(a),
            pageId,
            currentPageId: pageId,
            initialHref: activeHref ?? "",
            cleanup: tmpanchor.unregister,
          },
        });
        return;
      }

      return;
    },
    [MENU_COMMANDS.EDITOR_REMOVE_LINK]: async (a) => {
      logCommand(MENU_COMMANDS.EDITOR_REMOVE_LINK, a);
      const docEditor = getDocEditor(a);
      if (docEditor) {
        docEditor.chain().focus().unsetLink().run();
        return;
      }
      return;
    },
    [MENU_COMMANDS.EDITOR_TOGGLE_HIGHLIGHT]: async (a) => {
      logCommand(MENU_COMMANDS.EDITOR_TOGGLE_HIGHLIGHT, a);
      const docEditor = getDocEditor(a);
      if (docEditor) {
        const unset = !!a.payload?.unset;
        const color = a.payload?.color ?? ui.lastHighlightColor;
        if (unset) {
          docEditor.commands?.unsetHighlight?.();
          return;
        }
        docEditor.chain().focus().toggleHighlight({ color }).run();
        return;
      }
      return;
    },
    [MENU_COMMANDS.EDITOR_SET_HIGHLIGHT]: async (a) => {
      logCommand(MENU_COMMANDS.EDITOR_SET_HIGHLIGHT, a);
      const docEditor = getDocEditor(a);
      if (docEditor) {
        const color = a.payload?.color ?? ui.lastHighlightColor;
        ui.lastHighlightColor = color;
        docEditor.chain().focus().setHighlight({ color }).run();
        return;
      }
      return;
    },

    [MENU_COMMANDS.PAGE_CREATE_AFTER]: async (a) => {
      logCommand(MENU_COMMANDS.PAGE_CREATE_AFTER, a);
      const pageId = getPageId(a);
      if (!pageId) return;
      await actions.pages.createPageAfterAndActivate(pageId);
    },
    [MENU_COMMANDS.PAGE_DUPLICATE]: async (a) => {
      logCommand(MENU_COMMANDS.PAGE_DUPLICATE, a);
      const pageId = getPageId(a);
      if (!pageId) return;
      await actions.pages.duplicatePage(pageId);
    },
    [MENU_COMMANDS.PAGE_DELETE]: async (a) => {
      logCommand(MENU_COMMANDS.PAGE_DELETE, a);
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
      logCommand(MENU_COMMANDS.PAGE_RESTORE_TRASH, a);
      const pageId = getPageId(a);
      if (!pageId) return;
      return actions.pages.restorePageFromTrashFlow(pageId);
    },
    [MENU_COMMANDS.PAGE_PURGE]: async (a) => {
      logCommand(MENU_COMMANDS.PAGE_PURGE, a);
      const pageId = getPageId(a);
      if (!pageId) return;
      return actions.pages.purgePageFromTrashFlow(pageId);
    },

    [MENU_COMMANDS.COPY_TO_CLIPBOARD]: async (a) => {
      logCommand(MENU_COMMANDS.COPY_TO_CLIPBOARD, a);
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
