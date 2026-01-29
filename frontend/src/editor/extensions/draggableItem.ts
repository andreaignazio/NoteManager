import { Node, mergeAttributes } from "@tiptap/core";
import { Plugin } from "prosemirror-state";
import { Fragment, Node as PMNode } from "prosemirror-model";
import { Decoration, DecorationSet } from "prosemirror-view";
import {
  classForTextToken,
  classForBgToken,
  isTextToken,
  isBgToken,
} from "@/theme/colorsCatalog";
import { fontCssFamily, isFontToken } from "@/domain/fontCatalog";
import { posBetween } from "@/domain/position";
import { getLangLabel } from "@/domain/codeLangs";
import { anchorKey } from "@/ui/anchorsKeyBind";
import { useAnchorRegistryStore } from "@/stores/anchorRegistry";
import { useUIOverlayStore } from "@/stores/uioverlay";
import { useCommentsStore } from "@/stores/comments";

const normalizeItemId = (value: unknown): string | null => {
  if (value == null) return null;
  const str = String(value).trim();
  return str ? str : null;
};

const makeItemId = (): string => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id_${Math.random().toString(36).slice(2)}_${Date.now()}`;
};

const CODE_LANG_ANCHOR_KIND = "block:lang:blockRow:codeToolbar";
const CODE_MENU_ANCHOR_KIND = "block:dots:blockRow:codeToolbar";
const COMMENT_BADGE_ANCHOR_KIND = "block:comment:blockRow:blockContext";

const getDocNodeId = (node: PMNode, pos: number) =>
  normalizeItemId(node?.attrs?.id ?? null) ?? `docnode:${pos}`;

const getCodeBlockChild = (node: PMNode) => {
  const first = node?.content?.firstChild ?? null;
  if (first?.type?.name === "codeBlock") return first;
  let found: PMNode | null = null;
  node?.descendants?.((child) => {
    if (child?.type?.name === "codeBlock") {
      found = child;
      return false;
    }
    return true;
  });
  return found;
};

const isCodeDraggableItem = (node: PMNode) => {
  if (!node || node.type?.name !== "draggableItem") return false;
  if (node.attrs?.blockType === "code") return true;
  return !!getCodeBlockChild(node);
};

const getCodeLanguage = (node: PMNode) => {
  const code = getCodeBlockChild(node);
  const lang = code?.attrs?.language ?? null;
  return lang ? String(lang) : "plaintext";
};

const getCodeWrap = (node: PMNode) => node?.attrs?.codeWrap !== false;

const buildDraggableItemIndex = (doc: PMNode) => {
  const map = new Map<string, PMNode>();
  doc.descendants((node) => {
    if (node.type?.name !== "draggableItem") return true;
    const id = normalizeItemId(node.attrs?.id ?? null);
    if (id) map.set(id, node);
    return false;
  });
  return map;
};

const getIndentLevelFromIndex = (
  node: PMNode,
  index: Map<string, PMNode>,
  maxDepth = 64,
) => {
  let level = 0;
  let parentId = normalizeItemId(node.attrs?.parentId ?? null);
  const seen = new Set<string>();
  while (parentId && level < maxDepth) {
    if (seen.has(parentId)) break;
    seen.add(parentId);
    const parent = index.get(parentId);
    if (!parent) break;
    level += 1;
    parentId = normalizeItemId(parent.attrs?.parentId ?? null);
  }
  return level;
};

const getInheritedBlockTypeFromIndex = (
  node: PMNode,
  index: Map<string, PMNode>,
  maxDepth = 64,
) => {
  let parentId = normalizeItemId(node.attrs?.parentId ?? null);
  const seen = new Set<string>();
  let depth = 0;
  while (parentId && depth < maxDepth) {
    if (seen.has(parentId)) break;
    seen.add(parentId);
    const parent = index.get(parentId);
    if (!parent) break;
    const listType = parent.attrs?.listType ?? null;
    if (listType) return "p";
    const raw = parent.attrs?.blockType ?? "inherit";
    if (raw && raw !== "inherit") return raw;
    parentId = normalizeItemId(parent.attrs?.parentId ?? null);
    depth += 1;
  }
  return null;
};

export const DraggableItem = Node.create({
  name: "draggableItem",
  group: "block",
  content: "block+",
  defining: true,
  draggable: false,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) =>
          normalizeItemId(element.getAttribute("data-id")),
        renderHTML: (attrs) =>
          attrs.id ? { "data-id": String(attrs.id) } : {},
      },
      parentId: {
        default: null,
        parseHTML: (element) =>
          normalizeItemId(element.getAttribute("data-parent-id")),
        renderHTML: (attrs) =>
          attrs.parentId ? { "data-parent-id": String(attrs.parentId) } : {},
      },
      position: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-pos") || null,
        renderHTML: (attrs) =>
          attrs.position ? { "data-pos": String(attrs.position) } : {},
      },
      menuType: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-menu-type") || null,
        renderHTML: (attrs) =>
          attrs.menuType ? { "data-menu-type": attrs.menuType } : {},
      },
      blockType: {
        default: "inherit",
        parseHTML: (element) =>
          element.getAttribute("data-block-type") || "inherit",
        renderHTML: (attrs) =>
          attrs.blockType && attrs.blockType !== "inherit"
            ? { "data-block-type": attrs.blockType }
            : {},
      },
      font: {
        default: "default",
        parseHTML: (element) => element.getAttribute("data-font") || "default",
        renderHTML: (attrs) =>
          attrs.font && attrs.font !== "default"
            ? { "data-font": attrs.font }
            : {},
      },
      textColor: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-text-color") || null,
        renderHTML: (attrs) =>
          attrs.textColor && attrs.textColor !== "default"
            ? { "data-text-color": attrs.textColor }
            : {},
      },
      bgColor: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-bg-color") || null,
        renderHTML: (attrs) =>
          attrs.bgColor && attrs.bgColor !== "default"
            ? { "data-bg-color": attrs.bgColor }
            : {},
      },
      listType: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-list-type") || null,
        renderHTML: (attrs) =>
          attrs.listType ? { "data-list-type": attrs.listType } : {},
      },
      listStart: {
        default: null,
        parseHTML: (element) => {
          const raw = element.getAttribute("data-list-start");
          return raw ? Number(raw) : null;
        },
        renderHTML: (attrs) =>
          typeof attrs.listStart === "number"
            ? { "data-list-start": String(attrs.listStart) }
            : {},
      },
      todoChecked: {
        default: false,
        parseHTML: (element) =>
          element.getAttribute("data-todo-checked") === "true",
        renderHTML: (attrs) =>
          attrs.todoChecked ? { "data-todo-checked": "true" } : {},
      },
      codeWrap: {
        default: true,
        parseHTML: (element) => {
          const raw = element.getAttribute("data-code-wrap");
          if (raw == null) return true;
          return raw !== "false";
        },
        renderHTML: (attrs) =>
          attrs.codeWrap === false ? { "data-code-wrap": "false" } : {},
      },
    };
  },

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="draggable-item"]',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const styleParts: string[] = [];
    const textToken = node?.attrs?.textColor ?? null;
    const bgToken = node?.attrs?.bgColor ?? null;
    const fontToken = node?.attrs?.font ?? "default";
    const textVar = isTextToken(textToken)
      ? `var(--${classForTextToken(textToken)})`
      : null;
    const bgVar = isBgToken(bgToken)
      ? `var(--${classForBgToken(bgToken)})`
      : null;
    const fontFamily = isFontToken(fontToken)
      ? fontCssFamily(fontToken)
      : fontCssFamily("default");
    if (textVar && textToken !== "default") {
      styleParts.push(`--doc-item-text-color: ${textVar}`);
    }
    if (bgVar && bgToken !== "default") {
      styleParts.push(`--doc-item-bg-color: ${bgVar}`);
    }
    if (fontFamily && fontToken !== "default") {
      styleParts.push(`--doc-item-font-family: ${fontFamily}`);
    }
    const style = styleParts.length ? styleParts.join("; ") : undefined;
    return [
      "div",
      mergeAttributes(
        { class: "doc-item", "data-type": "draggable-item" },
        this.options.HTMLAttributes,
        HTMLAttributes,
        style ? { style } : {},
      ),
      0,
    ];
  },

  addProseMirrorPlugins() {
    const splitInlineByHardBreak = (frag: Fragment) => {
      const segments: PMNode[][] = [];
      let current: PMNode[] = [];
      frag.forEach((n) => {
        if (n.type?.name === "hardBreak") {
          segments.push(current);
          current = [];
          return;
        }
        current.push(n);
      });
      segments.push(current);
      return segments;
    };

    const blockTypeFromBlock = (block: PMNode) => {
      if (!block) return "p";
      if (block.type?.name === "heading") {
        const level = Number(block.attrs?.level ?? 1);
        if (level === 1) return "h1";
        if (level === 2) return "h2";
        return "h3";
      }
      if (block.type?.name === "blockquote") return "quote";
      if (block.type?.name === "codeBlock") return "code";
      if (block.type?.name === "horizontalRule") return "divider";
      if (block.type?.name === "paragraph") return "p";
      return "p";
    };

    const normalizeBlockNode = (
      block: PMNode,
      desired: string,
      schema: any,
    ) => {
      const extractInlineContent = (n: PMNode) => {
        if (!n) return null;
        if (n.type?.name === "paragraph" || n.type?.name === "heading") {
          return n.content;
        }
        if (n.type?.name === "blockquote") {
          const child = n.firstChild;
          if (child?.type?.name === "paragraph") return child.content;
        }
        return null;
      };

      const inline = extractInlineContent(block) ?? null;
      const createParagraph = () =>
        schema.nodes.paragraph.create(null, inline ?? undefined);
      const createHeading = (level: number) =>
        schema.nodes.heading.create({ level }, inline ?? undefined);
      const createBlockquote = () =>
        schema.nodes.blockquote.create(null, createParagraph());
      const createCodeBlock = () => {
        const text = block.textContent ?? "";
        return schema.nodes.codeBlock.create(null, schema.text(text));
      };
      const createDivider = () => schema.nodes.horizontalRule.create();

      if (desired === "inherit") return block;
      if (desired === "h1") return createHeading(1);
      if (desired === "h2") return createHeading(2);
      if (desired === "h3") return createHeading(3);
      if (desired === "quote") return createBlockquote();
      if (desired === "code") return createCodeBlock();
      if (desired === "divider") return createDivider();
      return createParagraph();
    };

    const splitBlockByHardBreaks = (
      block: PMNode,
      desired: string,
      schema: any,
    ) => {
      if (desired === "inherit") {
        const inferred = blockTypeFromBlock(block);
        return splitBlockByHardBreaks(block, inferred, schema);
      }
      if (desired === "code") return [block];
      if (desired === "divider") {
        if (block.type?.name === "horizontalRule") return [block];
        return [normalizeBlockNode(block, desired, schema)];
      }

      let baseBlock = block;
      if (block.type?.name === "blockquote") {
        const inner = block.firstChild;
        if (inner?.type?.name === "paragraph") {
          baseBlock = inner;
        }
      }

      const segments = splitInlineByHardBreak(baseBlock.content);
      if (!segments.length) return [normalizeBlockNode(block, desired, schema)];

      const createFromInline = (inline: PMNode[]) => {
        if (desired === "h1")
          return schema.nodes.heading.create({ level: 1 }, inline);
        if (desired === "h2")
          return schema.nodes.heading.create({ level: 2 }, inline);
        if (desired === "h3")
          return schema.nodes.heading.create({ level: 3 }, inline);
        if (desired === "quote") {
          const p = schema.nodes.paragraph.create(null, inline);
          return schema.nodes.blockquote.create(null, p);
        }
        return schema.nodes.paragraph.create(null, inline);
      };

      return segments.map((seg) => createFromInline(seg));
    };

    const isMatch = (block: PMNode, desired: string) => {
      if (desired === "p") return block.type?.name === "paragraph";
      if (desired === "h1")
        return block.type?.name === "heading" && block.attrs?.level === 1;
      if (desired === "h2")
        return block.type?.name === "heading" && block.attrs?.level === 2;
      if (desired === "h3")
        return block.type?.name === "heading" && block.attrs?.level === 3;
      if (desired === "quote") return block.type?.name === "blockquote";
      if (desired === "code") return block.type?.name === "codeBlock";
      if (desired === "divider") return block.type?.name === "horizontalRule";
      if (desired === "todo") return block.type?.name === "paragraph";
      return true;
    };

    const buildCodeToolbarDecorations = (doc: PMNode) => {
      const decorations: Decoration[] = [];
      doc.descendants((node, pos) => {
        if (!isCodeDraggableItem(node)) return true;

        const docNodeId = getDocNodeId(node, pos);
        const language = getCodeLanguage(node);
        const languageLabel = getLangLabel(language);
        const langKey = anchorKey(CODE_LANG_ANCHOR_KIND, docNodeId);
        const menuKey = anchorKey(CODE_MENU_ANCHOR_KIND, docNodeId);

        const deco = Decoration.widget(
          pos + 1,
          () => {
            const toolbar = document.createElement("div");
            toolbar.className = "doc-code-toolbar";

            const group = document.createElement("div");
            group.className = "doc-code-toolbar-group";

            const langBtn = document.createElement("button");
            langBtn.type = "button";
            langBtn.className = "doc-code-toolbar-segment lang";
            langBtn.setAttribute("data-code-toolbar-action", "lang");
            langBtn.setAttribute("data-anchor-key", langKey);
            langBtn.setAttribute("data-doc-node-id", docNodeId);
            langBtn.setAttribute("data-lang", language);
            langBtn.setAttribute("data-node-pos", String(pos));
            langBtn.textContent = languageLabel;

            const caret = document.createElement("span");
            caret.className = "caret";
            caret.textContent = "▾";
            langBtn.appendChild(caret);

            const sep = document.createElement("div");
            sep.className = "doc-code-toolbar-separator";

            const dotsBtn = document.createElement("button");
            dotsBtn.type = "button";
            dotsBtn.className = "doc-code-toolbar-segment icon";
            dotsBtn.setAttribute("data-code-toolbar-action", "menu");
            dotsBtn.setAttribute("data-anchor-key", menuKey);
            dotsBtn.setAttribute("data-doc-node-id", docNodeId);
            dotsBtn.setAttribute("data-node-pos", String(pos));
            dotsBtn.title = "Menu";
            dotsBtn.textContent = "⋯";

            group.append(langBtn, sep, dotsBtn);
            toolbar.appendChild(group);
            return toolbar;
          },
          { side: -1 },
        );

        decorations.push(deco);
        return false;
      });
      return DecorationSet.create(doc, decorations);
    };

    return [
      new Plugin({
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((tr) => tr.docChanged)) return null;

          const { schema } = newState;
          let tr = newState.tr;
          let changed = false;

          const generatedIds = new Map<number, string>();
          const getNodeId = (node: PMNode, pos: number) => {
            const existing = normalizeItemId(node.attrs?.id ?? null);
            if (existing) return existing;
            const cached = generatedIds.get(pos);
            if (cached) return cached;
            const nextId = makeItemId();
            generatedIds.set(pos, nextId);
            return nextId;
          };

          const buildIndexWithIds = (doc: PMNode) => {
            const map = new Map<string, PMNode>();
            doc.descendants((node, pos) => {
              if (node.type?.name !== "draggableItem") return true;
              const id = getNodeId(node, pos);
              if (id) map.set(id, node);
              return false;
            });
            return map;
          };

          const itemIndex = buildIndexWithIds(newState.doc);

          const getMenuType = (node: PMNode) => {
            const listType = node.attrs?.listType ?? null;
            if (listType === "bullet") return "ul";
            if (listType === "ordered") return "ol";
            const rawType = node.attrs?.blockType ?? "inherit";
            if (rawType === "inherit") {
              return getInheritedBlockTypeFromIndex(node, itemIndex) ?? "p";
            }
            return rawType || "p";
          };

          const ops: { pos: number; node: PMNode; blocks: PMNode[] }[] = [];

          newState.doc.descendants((node, pos) => {
            if (node.type?.name !== "draggableItem") return true;
            const listType = node.attrs?.listType ?? null;
            const rawType = node.attrs?.blockType ?? "inherit";
            const menuType = getMenuType(node);
            const desired = listType
              ? "p"
              : rawType === "inherit"
                ? (getInheritedBlockTypeFromIndex(node, itemIndex) ?? "p")
                : rawType;
            const block = node.firstChild;
            if (!block) return true;
            const blocks = splitBlockByHardBreaks(block, desired, schema);
            const needsSplit = blocks.length > 1;
            const needsNormalize = !isMatch(block, desired) || needsSplit;
            if (!needsNormalize) {
              if (node.attrs?.menuType !== menuType) {
                tr = tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  menuType,
                });
                changed = true;
              }
              return true;
            }

            ops.push({ pos, node, blocks });
            return false;
          });

          if (ops.length) {
            ops
              .sort((a, b) => b.pos - a.pos)
              .forEach(({ pos, node, blocks }) => {
                const children: PMNode[] = [];
                for (let i = 1; i < node.childCount; i += 1) {
                  children.push(node.child(i));
                }

                const baseAttrs = {
                  ...node.attrs,
                  blockType: node.attrs?.listType
                    ? "p"
                    : (node.attrs?.blockType ?? "inherit"),
                  menuType: getMenuType(node),
                };

                const items = blocks.map((blockNode, idx) => {
                  const nextAttrs = { ...baseAttrs } as Record<string, any>;
                  if (idx > 0 && nextAttrs.listType === "ordered") {
                    nextAttrs.listStart = null;
                  }
                  const content = [blockNode, ...(idx === 0 ? children : [])];
                  return node.type.create(
                    nextAttrs,
                    Fragment.fromArray(content),
                  );
                });

                tr = tr.replaceWith(
                  pos,
                  pos + node.nodeSize,
                  Fragment.fromArray(items),
                );
                changed = true;
              });
          }

          const normalizeInvalidItems = () => {
            const fixes: Array<{ pos: number; node: PMNode }> = [];
            tr.doc.descendants((node, pos) => {
              if (node.type?.name !== "draggableItem") return true;
              if (node.type.validContent(node.content)) return true;
              fixes.push({ pos, node });
              return false;
            });

            if (!fixes.length) return;

            fixes
              .sort((a, b) => b.pos - a.pos)
              .forEach(({ pos, node }) => {
                const blocks: PMNode[] = [];
                node.forEach((child) => {
                  if (child.isBlock) blocks.push(child);
                });
                if (!blocks.length) {
                  blocks.push(schema.nodes.paragraph.create());
                }
                const fixed = node.type.create(
                  node.attrs,
                  Fragment.fromArray(blocks),
                  node.marks,
                );
                tr = tr.replaceWith(pos, pos + node.nodeSize, fixed);
                changed = true;
              });
          };

          normalizeInvalidItems();

          const normalizeIdsPositions = () => {
            const docToScan = tr.doc;
            const index = buildIndexWithIds(docToScan);
            const itemsByParent = new Map<
              string,
              Array<{
                pos: number;
                node: PMNode;
                id: string;
                position: string | null;
              }>
            >();

            const getMenuType = (node: PMNode) => {
              const listType = node.attrs?.listType ?? null;
              if (listType === "bullet") return "ul";
              if (listType === "ordered") return "ol";
              const rawType = node.attrs?.blockType ?? "inherit";
              if (rawType === "inherit") {
                return getInheritedBlockTypeFromIndex(node, index) ?? "p";
              }
              return rawType || "p";
            };

            docToScan.descendants((node, pos) => {
              if (node.type?.name !== "draggableItem") return true;
              const id = getNodeId(node, pos);
              const parentId = normalizeItemId(node.attrs?.parentId ?? null);
              const key = parentId ?? "__root__";
              const position =
                typeof node.attrs?.position === "string"
                  ? node.attrs.position
                  : null;
              const entry = { pos, node, id, position };
              if (!itemsByParent.has(key)) itemsByParent.set(key, []);
              itemsByParent.get(key)?.push(entry);
              return false;
            });

            itemsByParent.forEach((items) => {
              if (!items.length) return;
              const nextKnown: Array<string | null> = new Array(
                items.length,
              ).fill(null);
              let nextPos: string | null = null;
              for (let i = items.length - 1; i >= 0; i -= 1) {
                const posVal = items[i].position;
                if (posVal) {
                  nextPos = posVal;
                } else {
                  nextKnown[i] = nextPos;
                }
              }

              let prevPos: string | null = null;
              for (let i = 0; i < items.length; i += 1) {
                const item = items[i];
                let position = item.position;
                if (!position) {
                  position = posBetween(prevPos, nextKnown[i]);
                }

                const menuType = getMenuType(item.node);
                const nextAttrs = {
                  ...item.node.attrs,
                  id: item.id,
                  position,
                  menuType,
                } as Record<string, any>;

                if (
                  item.node.attrs?.id !== item.id ||
                  item.node.attrs?.position !== position ||
                  item.node.attrs?.menuType !== menuType
                ) {
                  tr = tr.setNodeMarkup(item.pos, undefined, nextAttrs);
                  changed = true;
                }

                prevPos = position;
              }
            });
          };

          normalizeIdsPositions();

          return changed ? tr : null;
        },
      }),
      new Plugin({
        props: {
          decorations(state) {
            return buildCodeToolbarDecorations(state.doc);
          },
        },
        view(view) {
          const anchorRegistry = useAnchorRegistryStore();
          const uiOverlay = useUIOverlayStore();
          const cleanupByKey = new Map<string, () => void>();
          const elementByKey = new Map<string, HTMLElement>();

          const syncAnchors = () => {
            const next = new Map<string, HTMLElement>();
            view.dom
              .querySelectorAll<HTMLElement>("[data-anchor-key]")
              .forEach((el) => {
                const key = el.getAttribute("data-anchor-key");
                if (!key) return;
                next.set(key, el);
              });

            next.forEach((el, key) => {
              if (elementByKey.get(key) === el) return;
              cleanupByKey.get(key)?.();
              cleanupByKey.set(key, anchorRegistry.registerAnchor(key, el));
              elementByKey.set(key, el);
            });

            Array.from(elementByKey.keys()).forEach((key) => {
              if (next.has(key)) return;
              cleanupByKey.get(key)?.();
              cleanupByKey.delete(key);
              elementByKey.delete(key);
            });
          };

          const handleClick = (event: Event) => {
            const target = event.target as HTMLElement | null;
            const commentBtn = target?.closest<HTMLElement>(
              "[data-comment-action]",
            );
            if (commentBtn) {
              event.preventDefault();
              event.stopPropagation();
              const anchorKeyValue = commentBtn.getAttribute("data-anchor-key");
              const docNodeId = commentBtn.getAttribute("data-doc-node-id");
              const pageId =
                view.dom?.getAttribute?.("data-doc-page-id") ?? null;
              if (!anchorKeyValue || !docNodeId || !pageId) return;
              uiOverlay.requestOpen({
                menuId: "block.comment",
                anchorKey: anchorKeyValue,
                payload: {
                  pageId,
                  docNodeId,
                  placement: "right-start",
                },
              });
              return;
            }
            const btn = target?.closest<HTMLElement>(
              "[data-code-toolbar-action]",
            );
            if (!btn) return;

            event.preventDefault();
            event.stopPropagation();

            const action = btn.getAttribute("data-code-toolbar-action");
            const anchorKeyValue = btn.getAttribute("data-anchor-key");
            const docNodeId = btn.getAttribute("data-doc-node-id");
            const nodePosRaw = btn.getAttribute("data-node-pos");
            const pageId = view.dom?.getAttribute?.("data-doc-page-id") ?? null;

            if (!action || !pageId) return;

            if (action === "lang") {
              if (!anchorKeyValue || !docNodeId) return;
              uiOverlay.requestOpen({
                menuId: "block.codeLanguageMenu",
                anchorKey: anchorKeyValue,
                payload: {
                  pageId,
                  docNodeId,
                  placement: "bottom-end",
                },
              });
              return;
            }

            if (action === "menu") {
              if (!anchorKeyValue || !docNodeId) return;
              uiOverlay.requestOpen({
                menuId: "block.menu",
                anchorKey: anchorKeyValue,
                payload: {
                  pageId,
                  docNodeId,
                  placement: "right-start",
                },
              });
              return;
            }

            if (action === "wrap") {
              const pos = Number(nodePosRaw);
              if (!Number.isFinite(pos)) return;
              const currentNode = view.state.doc.nodeAt(pos);
              if (!currentNode || currentNode.type?.name !== "draggableItem") {
                return;
              }
              const nextWrap = !(currentNode.attrs?.codeWrap !== false);
              const nextAttrs = {
                ...currentNode.attrs,
                codeWrap: nextWrap,
              } as Record<string, any>;
              const tr = view.state.tr.setNodeMarkup(pos, undefined, nextAttrs);
              view.dispatch(tr);
              return;
            }
          };

          view.dom.addEventListener("pointerdown", handleClick, true);
          syncAnchors();

          return {
            update() {
              syncAnchors();
            },
            destroy() {
              view.dom.removeEventListener("pointerdown", handleClick, true);
              cleanupByKey.forEach((cleanup) => cleanup());
              cleanupByKey.clear();
              elementByKey.clear();
            },
          };
        },
      }),
    ];
  },

  addNodeView() {
    return ({ editor, getPos, node }) => {
      const commentsStore = useCommentsStore();
      const dom = document.createElement("div");
      dom.className = "doc-item";
      dom.setAttribute("data-type", "draggable-item");
      dom.draggable = false;

      const marker = document.createElement("span");
      marker.className = "doc-item-marker";
      marker.draggable = false;

      const content = document.createElement("div");
      content.className = "doc-item-content";
      content.draggable = false;

      const commentBadge = document.createElement("button");
      commentBadge.className = "doc-comment-badge";
      commentBadge.setAttribute("type", "button");
      commentBadge.setAttribute("data-comment-action", "open");
      commentBadge.setAttribute("aria-label", "Open comments");

      const badgeIcon = document.createElement("span");
      badgeIcon.className = "doc-comment-icon";
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("width", "12");
      svg.setAttribute("height", "12");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", "2");
      svg.setAttribute("stroke-linecap", "round");
      svg.setAttribute("stroke-linejoin", "round");
      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      path.setAttribute(
        "d",
        "M21 15a4 4 0 0 1-4 4H7l-4 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z",
      );
      svg.appendChild(path);
      badgeIcon.appendChild(svg);
      const badgeCount = document.createElement("span");
      badgeCount.className = "doc-comment-count";
      commentBadge.append(badgeIcon, badgeCount);

      dom.append(marker, content, commentBadge);

      let cachedDoc: PMNode | null = null;
      let cachedIndex: Map<string, PMNode> | null = null;
      let cachedIndentStep = 0;

      const getItemIndex = () => {
        if (!editor?.state?.doc) return new Map<string, PMNode>();
        if (cachedDoc !== editor.state.doc) {
          cachedDoc = editor.state.doc;
          cachedIndex = buildDraggableItemIndex(editor.state.doc);
        }
        return cachedIndex ?? new Map<string, PMNode>();
      };

      const readIndentStep = () => {
        if (cachedIndentStep) return cachedIndentStep;
        try {
          const raw =
            getComputedStyle(dom).getPropertyValue("--doc-indent-step") || "";
          const parsed = Number(raw.replace("px", "").trim());
          if (!Number.isNaN(parsed) && parsed > 0) {
            cachedIndentStep = parsed;
            return parsed;
          }
        } catch {
          // ignore
        }
        cachedIndentStep = 24;
        return cachedIndentStep;
      };

      const updateCommentBadgeFromStore = () => {
        const pageId = editor?.view?.dom?.getAttribute?.("data-doc-page-id");
        let docNodeId: string | null = null;
        if (typeof getPos === "function") {
          const pos = getPos();
          if (typeof pos === "number") {
            docNodeId = getDocNodeId(node, pos);
          }
        }
        if (!pageId || !docNodeId) return;
        const count = commentsStore.getCountByNode(pageId, docNodeId);
        const safeCount = count > 0 ? String(count) : "";
        badgeCount.textContent = safeCount;
        if (safeCount) {
          commentBadge.classList.add("has-count");
          commentBadge.setAttribute(
            "aria-label",
            `Apri commenti (${safeCount})`,
          );
          dom.classList.add("has-comments");
        } else {
          commentBadge.classList.remove("has-count");
          commentBadge.setAttribute("aria-label", "Apri commenti");
          dom.classList.remove("has-comments");
        }
      };

      const updateHierarchyAttrs = () => {
        const id = normalizeItemId(node?.attrs?.id ?? null);
        const parentId = normalizeItemId(node?.attrs?.parentId ?? null);
        const position =
          typeof node?.attrs?.position === "string"
            ? node.attrs.position
            : null;
        if (id) {
          dom.setAttribute("data-id", id);
        } else {
          dom.removeAttribute("data-id");
        }
        if (parentId) {
          dom.setAttribute("data-parent-id", parentId);
        } else {
          dom.removeAttribute("data-parent-id");
        }
        if (position) {
          dom.setAttribute("data-pos", position);
        } else {
          dom.removeAttribute("data-pos");
        }

        let docNodeId: string | null = null;
        if (typeof getPos === "function") {
          const pos = getPos();
          if (typeof pos === "number") {
            docNodeId = getDocNodeId(node, pos);
          }
        }
        if (docNodeId) {
          dom.setAttribute("data-doc-node-id", docNodeId);
          commentBadge.setAttribute("data-doc-node-id", docNodeId);
          commentBadge.setAttribute(
            "data-anchor-key",
            anchorKey(COMMENT_BADGE_ANCHOR_KIND, docNodeId),
          );
        } else {
          dom.removeAttribute("data-doc-node-id");
          commentBadge.removeAttribute("data-doc-node-id");
          commentBadge.removeAttribute("data-anchor-key");
        }
        updateCommentBadgeFromStore();
      };

      const updateIndent = () => {
        const index = getItemIndex();
        const level = getIndentLevelFromIndex(node, index);
        const step = readIndentStep();
        dom.style.setProperty("--doc-item-indent", `${level * step}px`);
        dom.setAttribute("data-indent-level", String(level));
      };

      const updateBlockType = () => {
        const rawType = node?.attrs?.blockType ?? "inherit";
        const listType = node?.attrs?.listType ?? null;
        let effectiveType = rawType;
        let menuType = rawType;

        if (listType) {
          effectiveType = "p";
          menuType = listType === "ordered" ? "ol" : "ul";
        }

        if (rawType === "inherit" && !listType) {
          const inherited = getInheritedBlockTypeFromIndex(
            node,
            getItemIndex(),
          );
          effectiveType = inherited || "p";
          menuType = effectiveType;
        }

        if (!listType && rawType && rawType !== "inherit") {
          menuType = rawType;
        }

        if (rawType) {
          dom.setAttribute("data-block-type", rawType);
        } else {
          dom.removeAttribute("data-block-type");
        }

        if (menuType) {
          dom.setAttribute("data-menu-type", menuType);
        } else {
          dom.removeAttribute("data-menu-type");
        }

        dom.classList.remove(
          "doc-item--p",
          "doc-item--h1",
          "doc-item--h2",
          "doc-item--h3",
          "doc-item--quote",
          "doc-item--code",
          "doc-item--divider",
          "doc-item--todo",
        );
        dom.classList.add(`doc-item--${effectiveType}`);
      };

      const updateCodeWrap = () => {
        const wrapOn = node?.attrs?.codeWrap !== false;
        if (wrapOn) {
          dom.removeAttribute("data-code-wrap");
        } else {
          dom.setAttribute("data-code-wrap", "false");
        }
      };

      const updateColors = () => {
        const textToken = node?.attrs?.textColor ?? null;
        const bgToken = node?.attrs?.bgColor ?? null;
        const fontToken = node?.attrs?.font ?? "default";
        const textVar = isTextToken(textToken)
          ? `var(--${classForTextToken(textToken)})`
          : null;
        const bgVar = isBgToken(bgToken)
          ? `var(--${classForBgToken(bgToken)})`
          : null;
        const fontFamily = isFontToken(fontToken)
          ? fontCssFamily(fontToken)
          : fontCssFamily("default");

        if (textVar && textToken !== "default") {
          dom.style.setProperty("--doc-item-text-color", textVar);
        } else {
          dom.style.removeProperty("--doc-item-text-color");
        }
        if (bgVar && bgToken !== "default") {
          dom.style.setProperty("--doc-item-bg-color", bgVar);
        } else {
          dom.style.removeProperty("--doc-item-bg-color");
        }
        if (fontFamily && fontToken !== "default") {
          dom.style.setProperty("--doc-item-font-family", fontFamily);
        } else {
          dom.style.removeProperty("--doc-item-font-family");
        }
      };

      const updateMarker = () => {
        if (typeof getPos !== "function") {
          marker.textContent = "";
          marker.removeAttribute("data-todo");
          marker.removeAttribute("data-checked");
          dom.classList.remove(
            "doc-item--list",
            "doc-item--list-bullet",
            "doc-item--list-ordered",
          );
          dom.removeAttribute("data-todo-checked");
          return;
        }

        const rawType = node?.attrs?.blockType ?? "inherit";
        if (rawType === "todo") {
          const checked = !!node?.attrs?.todoChecked;
          marker.textContent = checked ? "✓" : "";
          marker.setAttribute("data-todo", "true");
          marker.setAttribute("data-checked", String(checked));
          dom.setAttribute("data-todo-checked", String(checked));
          dom.classList.remove(
            "doc-item--list",
            "doc-item--list-bullet",
            "doc-item--list-ordered",
          );
          return;
        }

        const listType = node?.attrs?.listType ?? null;
        if (!listType) {
          marker.textContent = "";
          marker.removeAttribute("data-todo");
          marker.removeAttribute("data-checked");
          dom.classList.remove(
            "doc-item--list",
            "doc-item--list-bullet",
            "doc-item--list-ordered",
          );
          dom.removeAttribute("data-todo-checked");
          return;
        }

        dom.classList.add("doc-item--list");
        dom.classList.toggle("doc-item--list-bullet", listType === "bullet");
        dom.classList.toggle("doc-item--list-ordered", listType === "ordered");
        marker.removeAttribute("data-todo");
        marker.removeAttribute("data-checked");
        dom.removeAttribute("data-todo-checked");

        if (listType === "bullet") {
          marker.textContent = "•";
          return;
        }

        if (listType === "ordered") {
          try {
            const pos = getPos();
            if (typeof pos !== "number") {
              marker.textContent = "1.";
              return;
            }
            const $pos = editor.state.doc.resolve(pos);
            const parent = $pos.parent;
            const index = $pos.index($pos.depth);

            let startIndex = index;
            let startValue = Number(node?.attrs?.listStart ?? 1);
            for (let i = index - 1; i >= 0; i -= 1) {
              const sibling = parent.child(i);
              if (sibling?.attrs?.listType !== "ordered") break;
              startIndex = i;
              startValue = Number(sibling?.attrs?.listStart ?? 1);
            }

            const value = startValue + (index - startIndex);
            marker.textContent = `${value}.`;
          } catch {
            marker.textContent = "1.";
          }
        }
      };

      const toggleTodoChecked = (event: Event) => {
        const rawType = node?.attrs?.blockType ?? "inherit";
        if (rawType !== "todo") return;
        if (editor?.isEditable === false) return;
        event.preventDefault();
        event.stopPropagation();
        if (typeof getPos !== "function") return;
        const pos = getPos();
        if (typeof pos !== "number") return;
        const currentNode = editor.state.doc.nodeAt(pos);
        if (!currentNode || currentNode.type?.name !== "draggableItem") return;
        const currentChecked = !!currentNode.attrs?.todoChecked;
        const nextAttrs = {
          ...currentNode.attrs,
          todoChecked: !currentChecked,
        } as Record<string, any>;
        const tr = editor.state.tr.setNodeMarkup(
          pos,
          currentNode.type,
          nextAttrs,
        );
        editor.view.dispatch(tr);
      };

      marker.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        toggleTodoChecked(event);
      });

      updateBlockType();
      updateHierarchyAttrs();
      updateIndent();
      updateColors();
      updateCodeWrap();
      updateMarker();
      updateCommentBadgeFromStore();

      const unsubscribeComments = commentsStore.$subscribe(() => {
        updateCommentBadgeFromStore();
      });
      const onTransaction = () => {
        updateBlockType();
        updateHierarchyAttrs();
        updateIndent();
        updateColors();
        updateCodeWrap();
        updateMarker();
      };
      editor?.on?.("transaction", onTransaction);

      return {
        dom,
        contentDOM: content,
        update(updatedNode) {
          if (updatedNode.type.name !== "draggableItem") return false;
          node = updatedNode;
          updateBlockType();
          updateHierarchyAttrs();
          updateIndent();
          updateColors();
          updateCodeWrap();
          updateMarker();
          return true;
        },
        destroy() {
          editor?.off?.("transaction", onTransaction);
          marker.removeEventListener("click", toggleTodoChecked);
          unsubscribeComments?.();
        },
      };
    };
  },
});

export default DraggableItem;
