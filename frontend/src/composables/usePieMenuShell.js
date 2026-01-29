import { computed, ref } from "vue";
import { useOverlayBinding } from "@/composables/useOverlayBinding";
import { usePieMenuPolicy } from "@/composables/usePieMenuPolicy";
import { usePieMenuController } from "@/composables/usePieMenuController";
import useDocStore from "@/stores/docstore";
import { useEditorRegistryStore } from "@/stores/editorRegistry";
import { useOverlayStore } from "@/stores/overlay";
import { useUiStore } from "@/stores/ui";
import { computeFloatingPosition } from "@/utils/computeFloatingPosition";
import { useDocActions } from "@/actions/doc.actions";
import { useMenuActionDispatcher } from "@/composables/useMenuActionDispatcher";
import { anchorKey, anchorKind } from "@/ui/anchorsKeyBind";
import { MENU_COMMANDS } from "@/domain/menuActions";
import {
  BG_TOKENS,
  TEXT_TOKENS,
  labelForBgToken,
  labelForTextToken,
  styleForBgToken,
  styleForTextToken,
} from "@/theme/colorsCatalog";

export function usePieMenuShell() {
  const ui = useUiStore();
  const overlay = useOverlayStore();
  const docStore = useDocStore();
  const editorReg = useEditorRegistryStore();
  const docActions = useDocActions();
  const { dispatchMenuAction } = useMenuActionDispatcher();

  const pieOpen = ref(false);
  const pieKind = ref("context");
  const pieMode = ref("block"); // 'block' | 'ai'
  const pieArea = ref("main"); // 'main' | 'sidebar'
  const pieX = ref(0);
  const pieY = ref(0);
  const pieContext = ref(null);

  const mainMenuRef = ref(null);
  const colorPieRef = ref(null);
  const highlightPieRef = ref(null);
  const typePieRef = ref(null);

  const pieRAD_MAP = {
    hole: 26,
    main_outer: 92,
    color_inner: 66,
    color_outer: 106,
  };

  const pieAnchorX = ref(0);
  const pieAnchorY = ref(0);

  let PIE_MAX_DIAM = computed(() => {
    const max = Math.max(...Object.values(pieRAD_MAP));
    return max * 2;
  });
  PIE_MAX_DIAM = 260; // fisso per ora

  const pieCenter = computed(() => {
    if (!pieOpen.value) return { x: pieAnchorX.value, y: pieAnchorY.value };
    return computeFloatingPosition({
      x: pieAnchorX.value,
      y: pieAnchorY.value,
      w: PIE_MAX_DIAM,
      h: PIE_MAX_DIAM,
      tx: 0.5,
      ty: 0.5,
      margin: 10,
    });
  });

  function openPie({ kind = "context", mode, area, x, y, context }) {
    console.log("pieCenter before open:", pieCenter.value);
    console.log("Opening pie menu at:", { kind, mode, area, x, y, context });
    pieKind.value = kind;
    pieMode.value = mode;
    pieArea.value = area;

    pieAnchorX.value = x;
    pieAnchorY.value = y;

    pieX.value = x;
    pieY.value = y;

    pieContext.value = {
      ...(context ?? { area }),
      lastHighlightColor: ui.lastHighlightColor,
    };
    pieOpen.value = true;
  }

  function closePie() {
    pieOpen.value = false;
  }

  function getPieAreaFromEvent(e) {
    const t = e?.target;
    if (!(t instanceof Element)) return "main";
    const areaEl = t.closest("[data-pie-area]");
    return areaEl?.getAttribute("data-pie-area") || "main";
  }

  function getDocPageIdFromKey() {
    const key = docStore.currentDocKey;
    if (!key || !key.startsWith("doc:")) return null;
    return key.slice("doc:".length);
  }

  function getDocPageIdFromEvent(e) {
    const t = e?.target;
    if (t instanceof Element) {
      const root = t.closest("[data-doc-page-id]");
      const pageId = root?.getAttribute("data-doc-page-id") ?? null;
      if (pageId) return pageId;
    }
    return getDocPageIdFromKey();
  }

  function getDraggableItemPosAtCoords(ed, x, y) {
    if (!ed?.view?.posAtCoords) return null;
    const hit = ed.view.posAtCoords({ left: x, top: y });
    if (!hit) return null;
    const $pos = ed.state.doc.resolve(hit.pos);
    for (let d = $pos.depth; d > 0; d -= 1) {
      const node = $pos.node(d);
      if (node?.type?.name === "draggableItem") {
        return $pos.before(d);
      }
    }
    return null;
  }

  function findDraggableItemPosById(ed, itemId) {
    if (!ed?.state?.doc || !itemId) return null;
    let found = null;
    ed.state.doc.descendants((node, pos) => {
      if (node?.type?.name !== "draggableItem") return true;
      const id = node.attrs?.id != null ? String(node.attrs.id) : "";
      if (id && id === String(itemId)) {
        found = pos;
        return false;
      }
      return true;
    });
    return found;
  }

  function resolveDocNodePos(docNodeId, pageId) {
    if (!docNodeId || !pageId) return null;
    const ed =
      editorReg.getEditor(`doc:${pageId}`) || editorReg.getEditor(pageId);
    if (!ed) return null;
    const rawId = String(docNodeId);
    if (rawId.startsWith("docnode:")) {
      const raw = rawId.slice("docnode:".length);
      const pos = Number(raw);
      return Number.isFinite(pos) ? pos : null;
    }
    return findDraggableItemPosById(ed, rawId);
  }

  function resolveEditorForEvent(e, pageId) {
    if (!pageId) return null;
    const byKey =
      editorReg.getEditor(`doc:${pageId}`) || editorReg.getEditor(pageId);
    if (byKey) return byKey;
    const target = e?.target;
    if (!(target instanceof Element)) return null;
    const registry = editorReg.registry?.value ?? null;
    if (!registry) return null;
    for (const [key, ed] of registry.entries()) {
      if (!String(key).startsWith("doc:")) continue;
      if (ed?.view?.dom?.contains?.(target)) return ed;
    }
    return null;
  }

  function getDocNodeIdAtEvent(e) {
    const pageId = getDocPageIdFromEvent(e);
    if (!(e?.target instanceof Element)) return null;
    console.log("is target an Element?", e?.target instanceof Element);
    const el = e.target.closest?.("[data-id]");
    const itemId = el?.getAttribute?.("data-id") ?? null;
    if (itemId) return itemId;
    if (!pageId) return null;
    const ed = resolveEditorForEvent(e, pageId);
    if (!ed) return null;
    if (!ed.view?.dom?.contains?.(e.target)) return null;
    const pos = getDraggableItemPosAtCoords(ed, e.clientX, e.clientY);
    if (typeof pos !== "number") return null;
    return `docnode:${pos}`;
  }

  function getDocNodeAttrs(docNodeId, pageId) {
    if (!docNodeId || !pageId) return null;
    const ed = editorReg.getEditor(`doc:${pageId}`);
    if (!ed) return null;
    const pos = resolveDocNodePos(docNodeId, pageId);
    if (typeof pos !== "number") return null;
    const node = ed.state.doc.nodeAt(pos);
    if (!node || node.type.name !== "draggableItem") return null;
    return node.attrs ?? null;
  }

  usePieMenuPolicy({
    isOpen: () => pieOpen.value,
    close: closePie,
    open: openPie,
    getContextAt: (e) => {
      const area = getPieAreaFromEvent(e);
      const t = e?.target;
      console.log("getContextAt event target:", t);
      console.log(t instanceof Element);
      if (!(t instanceof Element)) return { area };

      if (area === "sidebar") {
        const blockEl = t.closest("[data-block-id]") || t.closest("[data-id]");
        const pageId =
          blockEl?.getAttribute("data-block-id") ||
          blockEl?.getAttribute("data-id") ||
          null;
        let anchorScope = null;
        const pageEl = t.closest("[data-anchor-scope]");
        anchorScope = pageEl?.getAttribute("data-anchor-scope") ?? null;
        return { area, pageId, anchorScope };
      }

      const docNodeId = getDocNodeIdAtEvent(e) ?? docStore.currentDocNodeId;
      console.log("Determined docNodeId:", docNodeId);
      const pageId = getDocPageIdFromEvent(e);
      if (docNodeId && pageId) {
        return { area, docNodeId, pageId };
      }

      return { area };
    },
  });

  function isInvertKey(ctx) {
    return ctx?.mods?.alt;
  }

  function dispatchCommand(command, ctx, payload) {
    return dispatchMenuAction({
      type: "command",
      ctx,
      command,
      payload,
    });
  }

  function dispatchOpenMenu({ ctx, menuId, anchorKey, payload }) {
    return dispatchMenuAction({
      type: "openMenu",
      ctx,
      menuId,
      anchorKey,
      payload,
    });
  }

  async function onPieAction(actionId, ctxFromEvent) {
    const ctx = ctxFromEvent ?? pieContext.value ?? {};

    if (ctx.area === "sidebar") {
      const pageId = ctx.pageId;
      switch (actionId) {
        case "share": {
          const BASE_URL = "http://localhost:5173";
          const URL = BASE_URL + `/pages/${pageId}`;
          await dispatchCommand(
            MENU_COMMANDS.COPY_TO_CLIPBOARD,
            { pageId },
            { text: URL },
          );
          break;
        }
        case "ai":
          break;
        case "newPage":
          await dispatchCommand(MENU_COMMANDS.PAGE_CREATE_AFTER, { pageId });
          break;
        case "renamePage": {
          const kindTitle = anchorKind(
            "page",
            "title",
            "sidebar",
            ctx.anchorScope,
          );
          const keyTitle = anchorKey(kindTitle, pageId);
          await dispatchOpenMenu({
            ctx: { pageId, anchorKey: keyTitle },
            menuId: "page.titlePopover",
            anchorKey: keyTitle,
            payload: { pageId },
          });
          break;
        }
        case "duplicatePage":
          await dispatchCommand(MENU_COMMANDS.PAGE_DUPLICATE, { pageId });
          break;
        case "deletePage":
          await dispatchCommand(MENU_COMMANDS.PAGE_DELETE, { pageId });
          break;
        default:
          break;
      }
      return;
    }

    const docNodeId = ctx.docNodeId ?? null;
    const pageId = ctx.pageId ?? null;

    if (!docNodeId) return;

    const commandCtx = { docNodeId, pageId };

    switch (actionId) {
      case "duplicate":
        await dispatchCommand(MENU_COMMANDS.BLOCK_DUPLICATE, commandCtx);
        break;
      case "color":
        break;
      case "highlight":
        await dispatchCommand(
          MENU_COMMANDS.EDITOR_TOGGLE_HIGHLIGHT,
          commandCtx,
          {
            color: ui.lastHighlightColor,
            unset: isInvertKey(ctx),
          },
        );
        break;
      case "moveTo":
        await dispatchCommand(MENU_COMMANDS.BLOCK_MOVE_TO_PAGE, commandCtx);
        break;
      case "changeType":
        break;
      case "ai":
        break;
      case "share":
        if (pageId) {
          const BASE_URL = "http://localhost:5173";
          const URL = BASE_URL + `/pages/${pageId}`;
          await dispatchCommand(
            MENU_COMMANDS.COPY_TO_CLIPBOARD,
            { pageId },
            { text: URL },
          );
        }
        break;
      case "copy":
        await dispatchCommand(MENU_COMMANDS.EDITOR_COPY, commandCtx);
        break;
      case "paste":
        await dispatchCommand(MENU_COMMANDS.EDITOR_PASTE, commandCtx);
        break;
      case "bold":
        await dispatchCommand(MENU_COMMANDS.EDITOR_BOLD, commandCtx);
        break;
      case "italic":
        await dispatchCommand(MENU_COMMANDS.EDITOR_ITALIC, commandCtx);
        break;
      case "strike":
        await dispatchCommand(MENU_COMMANDS.EDITOR_STRIKE, commandCtx);
        break;
      case "underline":
        await dispatchCommand(MENU_COMMANDS.EDITOR_UNDERLINE, commandCtx);
        break;
      case "link":
        if (ctx?.mods?.alt) {
          await dispatchCommand(MENU_COMMANDS.EDITOR_REMOVE_LINK, {
            ...commandCtx,
          });
          break;
        }
        await dispatchCommand(MENU_COMMANDS.EDITOR_OPEN_LINK, {
          ...commandCtx,
        });
        break;
      default:
        break;
    }
  }

  const pieController = usePieMenuController({
    pieOpen,
    pieKind,
    pieMode,
    pieArea,
    pieX,
    pieY,
    pieContext,
    closePie,

    mainMenuRef: () => mainMenuRef.value,
    colorMenuRef: () => colorPieRef.value,
    highlightMenuRef: () => highlightPieRef.value,
    dwellMs: 300,
    submenuIds: computed(() =>
      pieMode.value === "block" ? ["color", "highlight", "changeType"] : [],
    ).value,
    dwellMoveToId: "moveTo",

    onAction: async (id, ctx) => {
      if (id === "moveToCommit") {
        const targetPageId = ctx?.targetPageId;
        const docNodeId = ctx?.docNodeId ?? null;
        if (docNodeId) {
          const fromPageId = ctx?.pageId ?? null;
          const pos = resolveDocNodePos(docNodeId, fromPageId);
          if (fromPageId && targetPageId && Number.isFinite(pos)) {
            await docActions.moveNodeToPage(fromPageId, targetPageId, pos);
          }
          return;
        }
        return;
      }

      await onPieAction(id, ctx);
    },

    onSetTextToken: async (token, ctx) => {
      const docNodeId = ctx?.docNodeId ?? null;
      const pageId = ctx?.pageId ?? null;
      if (!docNodeId) return;
      await dispatchCommand(
        MENU_COMMANDS.BLOCK_SET_TEXT_COLOR,
        { docNodeId, pageId },
        { token: String(token) },
      );
    },

    onSetBgToken: async (token, ctx) => {
      const docNodeId = ctx?.docNodeId ?? null;
      const pageId = ctx?.pageId ?? null;
      if (!docNodeId) return;
      await dispatchCommand(
        MENU_COMMANDS.BLOCK_SET_BG_COLOR,
        { docNodeId, pageId },
        { token: String(token) },
      );
    },

    onSetHighlightColor: async (color, ctx) => {
      const docNodeId = ctx?.docNodeId ?? null;
      const pageId = ctx?.pageId ?? null;
      if (!docNodeId) return;
      await dispatchCommand(
        MENU_COMMANDS.EDITOR_SET_HIGHLIGHT,
        { docNodeId, pageId },
        { color },
      );
    },

    onSetBlockType: async (blockType, ctx) => {
      console.log("onSetBlockType:", blockType, ctx);
      const docNodeId = ctx?.docNodeId ?? null;
      const pageId = ctx?.pageId ?? null;
      if (!docNodeId) return;
      await dispatchCommand(
        MENU_COMMANDS.BLOCK_APPLY_TYPE,
        { docNodeId, pageId },
        { blockType },
      );
    },
  });

  const currentBg = computed(() => {
    const docNodeId = pieContext.value?.docNodeId ?? null;
    const pageId = pieContext.value?.pageId ?? null;
    if (!docNodeId) return null;
    return getDocNodeAttrs(docNodeId, pageId)?.bgColor ?? null;
  });

  const currentText = computed(() => {
    const docNodeId = pieContext.value?.docNodeId ?? null;
    const pageId = pieContext.value?.pageId ?? null;
    if (!docNodeId) return null;
    return getDocNodeAttrs(docNodeId, pageId)?.textColor ?? null;
  });

  const currentBlockType = computed(() => {
    const docNodeId = pieContext.value?.docNodeId ?? null;
    const pageId = pieContext.value?.pageId ?? null;
    if (!docNodeId) return null;
    const attrs = getDocNodeAttrs(docNodeId, pageId) ?? null;
    return attrs?.menuType ?? attrs?.blockType ?? null;
  });

  const labelForBg = () => BG_TOKENS.map((t) => labelForBgToken(t));
  const labelForText = () => TEXT_TOKENS.map((t) => labelForTextToken(t));
  const letterStyleForText = (token) => styleForTextToken(token);
  const swatchStyleForBg = (token) => styleForBgToken(token);

  const pieTop = pieController.top;

  function getPieMenuEl() {
    const mainEl = mainMenuRef.value?.$el ?? null;
    const colorEl = colorPieRef.value?.$el ?? null;
    return (pieTop.value === "color" ? colorEl : mainEl) ?? null;
  }

  useOverlayBinding({
    id: "pie",
    kind: "pie",
    priority: 180,
    behaviour: "exclusiveKinds",
    exclusiveKinds: ["hoverbar", "dropdown"],
    isOpen: () => pieOpen.value,
    requestClose: () => {
      closePie();
    },
    canOpen: () => {
      const top = overlay.top;
      if (!top) return true;
      const topP = top.priority ?? 0;
      return topP <= 3;
    },
    getMenuEl: () => getPieMenuEl(),
    getInteractionScope: () => pieController.interactionScope.value,
    options: {
      closeOnOutside: true,
      closeOnEsc: true,
      restoreFocus: true,
      stopPointerOutside: true,
      allowAnchorClick: false,
      lockScroll: false,
    },
  });

  const HIGHLIGHT_COLORS = [
    "#FFEE58",
    "#FFD54F",
    "#FFAB91",
    "#F48FB1",
    "#CE93D8",
    "#90CAF9",
    "#80DEEA",
    "#A5D6A7",
  ];

  return {
    TEXT_TOKENS,
    BG_TOKENS,
    pieOpen,
    pieMode,
    pieArea,
    pieAnchorX,
    pieAnchorY,
    pieCenter,
    pieContext,
    pieTop,
    pieController,
    mainMenuRef,
    colorPieRef,
    highlightPieRef,
    typePieRef,
    currentText,
    currentBg,
    currentBlockType,
    labelForBg,
    labelForText,
    letterStyleForText,
    swatchStyleForBg,
    HIGHLIGHT_COLORS,
  };
}

export default usePieMenuShell;
