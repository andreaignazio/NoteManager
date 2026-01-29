import { Extension } from "@tiptap/core";
import { Plugin, TextSelection } from "prosemirror-state";
import { Fragment } from "prosemirror-model";
import type { Node as PMNode, Slice } from "prosemirror-model";
import type { EditorState } from "prosemirror-state";

import { useAppActions } from "@/actions/useAppActions";

export type PasteSplitArgs = {};

export const PasteSplitExtension = Extension.create<{
  onPasteSplit?: (args: {
    slice: Slice;
    state: EditorState;
    itemsOverride: any[];
  }) => void;
}>({
  name: "pasteSplit",

  addProseMirrorPlugins() {
    const actions = useAppActions();

    type JsonNode = {
      type: string;
      attrs?: Record<string, any>;
      content?: JsonNode[];
      text?: string;
      marks?: any[];
    };

    const makeTempId = () => crypto.randomUUID();

    const normalizeItemId = (value: unknown): string | null => {
      if (value == null) return null;
      const str = String(value).trim();
      return str ? str : null;
    };

    const ensureItemId = (attrs: Record<string, any> = {}) => {
      const next = { ...attrs };
      if (!normalizeItemId(next.id)) {
        next.id = makeTempId();
      }
      return next;
    };

    const blockTypeFromNode = (node: JsonNode) => {
      if (!node) return "p";
      if (node.type === "heading") {
        const level = Number(node.attrs?.level ?? 1);
        if (level === 1) return "h1";
        if (level === 2) return "h2";
        return "h3";
      }
      if (node.type === "blockquote") return "quote";
      if (node.type === "codeBlock") return "code";
      if (node.type === "horizontalRule") return "divider";
      if (node.type === "paragraph") return "p";
      return "p";
    };

    const wrapInDraggableItem = (node: JsonNode) => {
      if (!node) return null;
      if (node.type === "draggableItem") return node;
      const attrs = ensureItemId({ blockType: blockTypeFromNode(node) });
      return { type: "draggableItem", attrs, content: [node] };
    };

    const splitInlineByHardBreak = (content: JsonNode[] = []) => {
      const segments: JsonNode[][] = [];
      let current: JsonNode[] = [];
      content.forEach((node) => {
        if (!node) return;
        if (node.type === "hardBreak") {
          segments.push(current);
          current = [];
          return;
        }
        current.push(node);
      });
      segments.push(current);
      return segments;
    };

    const splitParagraphByHardBreak = (node: JsonNode) => {
      if (!node || node.type !== "paragraph") return [node];
      const content = Array.isArray(node.content) ? node.content : [];
      const segments = splitInlineByHardBreak(content).filter(
        (seg) => seg.length,
      );
      if (!segments.length) return [node];
      return segments.map((seg) => ({ ...node, content: seg }));
    };

    const normalizeBlockChildren = (children: JsonNode[] = []) => {
      const next: JsonNode[] = [];
      children.forEach((child) => {
        if (!child) return;
        if (child.type === "bulletList" || child.type === "orderedList") {
          next.push(...normalizeNodeToDraggableItems(child));
          return;
        }
        if (child.type === "draggableItem") {
          next.push(child);
          return;
        }
        if (Array.isArray(child.content)) {
          next.push({
            ...child,
            content: normalizeBlockChildren(child.content),
          });
          return;
        }
        next.push(child);
      });
      return next;
    };

    const splitDraggableItemContent = (node: JsonNode): JsonNode[] => {
      const attrs = { ...(node?.attrs ?? {}) };
      const content = normalizeBlockChildren(node?.content || []);

      let derivedBlockType: string | null = null;
      for (const child of content) {
        if (!child) continue;
        if (child.type === "draggableItem") continue;
        derivedBlockType = blockTypeFromNode(child);
        break;
      }

      const nextAttrs = { ...attrs };
      if (!nextAttrs.blockType || nextAttrs.blockType === "p") {
        if (derivedBlockType && derivedBlockType !== "p") {
          nextAttrs.blockType = derivedBlockType;
        }
      }

      const baseId = normalizeItemId(nextAttrs.id);
      const items: JsonNode[] = [];
      let currentBlock: JsonNode | null = null;
      const childItems: JsonNode[] = [];

      content.forEach((child) => {
        if (!child) return;
        if (child.type === "draggableItem") {
          childItems.push(child);
          return;
        }

        const blocks = splitParagraphByHardBreak(child);
        blocks.forEach((block) => {
          if (!currentBlock) {
            currentBlock = block;
            return;
          }

          const itemAttrs = { ...nextAttrs };
          if (!items.length && baseId) {
            itemAttrs.id = baseId;
          } else {
            delete itemAttrs.id;
          }
          items.push({
            type: "draggableItem",
            attrs: ensureItemId(itemAttrs),
            content: [currentBlock],
          });
          currentBlock = block;
        });
      });

      if (!currentBlock) {
        currentBlock = { type: "paragraph" };
      }

      const lastAttrs = { ...nextAttrs };
      if (!items.length && baseId) {
        lastAttrs.id = baseId;
      } else {
        delete lastAttrs.id;
      }
      items.push({
        type: "draggableItem",
        attrs: ensureItemId(lastAttrs),
        content: [currentBlock],
      });

      if (!childItems.length) return items;

      const parentId = normalizeItemId(items[0]?.attrs?.id);
      const flattenedChildren: JsonNode[] = childItems
        .map((child) => {
          const childAttrs = { ...(child.attrs ?? {}) };
          if (parentId && !normalizeItemId(childAttrs.parentId)) {
            childAttrs.parentId = parentId;
          }
          return { ...child, attrs: childAttrs };
        })
        .flatMap((child) => splitDraggableItemContent(child));

      return [...items, ...flattenedChildren];
    };

    const normalizeListNode = (
      listNode: JsonNode,
      parentId: string | null = null,
    ) => {
      const listType = listNode.type === "bulletList" ? "bullet" : "ordered";
      const start = Number(listNode.attrs?.start ?? 1);
      const items = Array.isArray(listNode.content) ? listNode.content : [];
      const normalized: JsonNode[] = [];

      const buildListItem = (item: JsonNode, idx: number) => {
        const raw = Array.isArray(item.content) ? item.content : [];
        const blockNodes: JsonNode[] = [];
        const nestedLists: JsonNode[] = [];
        const childItems: JsonNode[] = [];

        raw.forEach((child) => {
          if (!child) return;
          if (child.type === "bulletList" || child.type === "orderedList") {
            nestedLists.push(child);
            return;
          }
          if (child.type === "draggableItem") {
            childItems.push(child);
            return;
          }
          if (Array.isArray(child.content)) {
            blockNodes.push({
              ...child,
              content: normalizeBlockChildren(child.content),
            });
            return;
          }
          blockNodes.push(child);
        });

        const blocksExpanded = blockNodes
          .map((node) => splitParagraphByHardBreak(node))
          .flat();
        const baseBlock = blocksExpanded.shift() ?? { type: "paragraph" };
        const extraChildren = blocksExpanded
          .map((node) => wrapInDraggableItem(node))
          .filter(Boolean) as JsonNode[];

        const attrs: Record<string, any> = {
          listType,
          blockType: blockTypeFromNode(baseBlock),
        };
        if (parentId) attrs.parentId = parentId;
        if (listType === "ordered" && idx === 0 && start !== 1) {
          attrs.listStart = start;
        }

        const baseAttrs = ensureItemId(attrs);

        const baseItem = {
          type: "draggableItem",
          attrs: baseAttrs,
          content: [baseBlock],
        };

        const nestedFromBlocks = extraChildren.map((node) => {
          const nextAttrs = ensureItemId({
            ...(node.attrs ?? {}),
            parentId: baseAttrs.id,
          });
          return { ...node, attrs: nextAttrs };
        });

        const nestedFromItems = childItems
          .map((child) => {
            const childAttrs = { ...(child.attrs ?? {}) };
            if (!normalizeItemId(childAttrs.parentId)) {
              childAttrs.parentId = baseAttrs.id;
            }
            return { ...child, attrs: childAttrs };
          })
          .flatMap((child) => splitDraggableItemContent(child));

        const nestedFromLists = nestedLists.flatMap((list) =>
          normalizeListNode(list, String(baseAttrs.id)),
        );

        return [
          baseItem,
          ...nestedFromBlocks,
          ...nestedFromItems,
          ...nestedFromLists,
        ];
      };

      items.forEach((item, idx) => {
        if (!item || item.type !== "listItem") return;
        normalized.push(...buildListItem(item, idx));
      });
      return normalized;
    };

    const normalizeNodeToDraggableItems = (node: JsonNode) => {
      if (!node) return [];
      if (node.type === "draggableItem") {
        return splitDraggableItemContent(node);
      }
      if (node.type === "bulletList" || node.type === "orderedList") {
        return normalizeListNode(node);
      }
      const content = normalizeBlockChildren(node.content || []);
      const normalizedNode = node.content ? { ...node, content } : node;
      const wrapped = wrapInDraggableItem(normalizedNode);
      return wrapped ? [wrapped] : [];
    };

    const normalizeSliceToDraggableItems = (slice: Slice, schema: any) => {
      try {
        const json = (slice?.content?.toJSON?.() ?? []) as JsonNode[];
        const out: JsonNode[] = [];
        json.forEach((node) => {
          out.push(...normalizeNodeToDraggableItems(node));
        });
        if (!out.length) return [];
        return out.map((node) => schema.nodeFromJSON(node));
      } catch {
        return [];
      }
    };

    const isEmptyDraggableItem = (node: PMNode | null) => {
      if (!node || node.type?.name !== "draggableItem") return false;
      if (node.childCount > 1) return false;
      const block = node.firstChild;
      if (!block || block.type?.name !== "paragraph") return false;
      if (block.childCount > 0) return false;
      return (node.textContent ?? "").trim().length === 0;
    };

    const normalizeDraggableItemBlock = (node: PMNode, schema: any) => {
      if (!node || node.type?.name !== "draggableItem") return node;
      const listType = node.attrs?.listType ?? null;
      const desiredBlockType = listType ? "p" : (node.attrs?.blockType ?? "p");
      const block = node.firstChild;
      if (!block) return node;

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

      const normalizedBlock = (() => {
        if (desiredBlockType === "h1") return createHeading(1);
        if (desiredBlockType === "h2") return createHeading(2);
        if (desiredBlockType === "h3") return createHeading(3);
        if (desiredBlockType === "quote") return createBlockquote();
        if (desiredBlockType === "code") return createCodeBlock();
        return createParagraph();
      })();

      const nextAttrs = {
        ...node.attrs,
        blockType: desiredBlockType,
      };
      return schema.nodes.draggableItem.create(nextAttrs, [normalizedBlock]);
    };

    const compactNodes = (nodes: Array<PMNode | null>) =>
      nodes.filter((n): n is PMNode => !!n);

    const findDraggableItemDepth = ($pos: any) => {
      if (!$pos) return null;
      for (let d = $pos.depth; d > 0; d -= 1) {
        if ($pos.node(d)?.type?.name === "draggableItem") return d;
      }
      return null;
    };

    const isInsideCodeBlock = ($pos: any) => {
      if (!$pos) return false;
      for (let d = $pos.depth; d > 0; d -= 1) {
        if ($pos.node(d)?.type?.name === "codeBlock") return true;
      }
      const depth = findDraggableItemDepth($pos);
      if (depth == null) return false;
      const itemNode = $pos.node(depth);
      if (itemNode?.attrs?.blockType === "code") return true;
      let found = false;
      itemNode?.descendants?.((node: PMNode) => {
        if (node?.type?.name === "codeBlock") {
          found = true;
          return false;
        }
        return true;
      });
      return found;
    };

    const handleSingleDocPaste = (
      view: any,
      event: ClipboardEvent,
      slice: Slice,
    ) => {
      const schema = view.state.schema;
      const html = event?.clipboardData?.getData("text/html") ?? "";
      const text = event?.clipboardData?.getData("text/plain") ?? "";

      const rawItems = html
        ? actions.editor.clipboardHtmlToBlocks(html, schema)
        : actions.editor.plainTextToBlocks(text, schema);

      const hasListItems = (items: any[]): boolean => {
        for (const item of items || []) {
          if (!item) continue;
          if (item.type === "ul" || item.type === "ol") return true;
          if (Array.isArray(item.children) && hasListItems(item.children)) {
            return true;
          }
        }
        return false;
      };

      const inlineContentFromItem = (item: any) => {
        try {
          const json = item?.content?.json ?? null;
          if (!json) return null;
          const doc = schema.nodeFromJSON(json);
          const first = doc?.content?.firstChild ?? null;
          return first?.content ?? null;
        } catch {
          return null;
        }
      };

      const textFallbackContent = (item: any) => {
        const txt = item?.content?.text ?? "";
        return txt ? [schema.text(txt)] : null;
      };

      const createBlockNodeForItem = (item: any) => {
        const type = String(item?.type ?? "p");
        const inlineContent =
          inlineContentFromItem(item) ?? textFallbackContent(item);

        if (type === "h1" || type === "h2" || type === "h3") {
          const level = type === "h1" ? 1 : type === "h2" ? 2 : 3;
          return schema.nodes.heading?.create(
            { level },
            inlineContent ?? undefined,
          );
        }
        if (type === "quote") {
          const para = schema.nodes.paragraph.create(
            null,
            inlineContent ?? undefined,
          );
          return schema.nodes.blockquote?.create(null, para);
        }
        if (type === "code") {
          const textNode = schema.text(item?.content?.text ?? "");
          return schema.nodes.codeBlock?.create(null, textNode);
        }
        if (type === "divider") {
          return schema.nodes.horizontalRule?.create();
        }
        if (type === "todo") {
          return schema.nodes.paragraph?.create(
            null,
            inlineContent ?? undefined,
          );
        }
        return schema.nodes.paragraph?.create(null, inlineContent ?? undefined);
      };

      const blockTypeFromItemType = (type: string) => {
        if (type === "h1" || type === "h2" || type === "h3") return type;
        if (type === "quote") return "quote";
        if (type === "code") return "code";
        if (type === "divider") return "divider";
        if (type === "todo") return "todo";
        return "p";
      };

      const itemToDraggableNodes = (
        item: any,
        parentId: string | null = null,
        inheritedListType: "bullet" | "ordered" | null = null,
      ): PMNode[] => {
        if (!item) return [];
        const type = String(item.type ?? "p");
        const childItems = Array.isArray(item.children) ? item.children : [];

        if (type === "li") {
          const baseBlock =
            createBlockNodeForItem({ ...item, type: "p" }) ||
            schema.nodes.paragraph.create();
          const attrs = ensureItemId({
            listType: inheritedListType,
            blockType: blockTypeFromItemType("p"),
            listStart: null,
            parentId,
          });
          const baseNode = schema.nodes.draggableItem.create(attrs, [
            baseBlock,
          ]);

          const nested = childItems.flatMap((child: any) =>
            itemToDraggableNodes(child, String(attrs.id), null),
          );
          return [baseNode, ...nested];
        }

        if (type === "ul" || type === "ol") {
          const listType = type === "ol" ? "ordered" : "bullet";
          const baseBlock =
            createBlockNodeForItem({ ...item, type: "p" }) ||
            schema.nodes.paragraph.create();
          const attrs = ensureItemId({
            listType,
            blockType: blockTypeFromItemType("p"),
            listStart: null,
            parentId,
          });
          const baseNode = schema.nodes.draggableItem.create(attrs, [
            baseBlock,
          ]);

          const nested = childItems.flatMap((child: any) =>
            itemToDraggableNodes(child, String(attrs.id), listType),
          );
          return [baseNode, ...nested];
        }

        const baseBlock =
          createBlockNodeForItem(item) || schema.nodes.paragraph.create();
        const attrs = ensureItemId({
          blockType: blockTypeFromItemType(type),
          parentId,
        });
        const baseNode = schema.nodes.draggableItem.create(attrs, [baseBlock]);
        const nested = childItems.flatMap((child: any) =>
          itemToDraggableNodes(child, String(attrs.id), null),
        );
        return [baseNode, ...nested];
      };

      const itemsFromClipboard = compactNodes(
        rawItems.flatMap((item) => itemToDraggableNodes(item)),
      ).map((node) => normalizeDraggableItemBlock(node, schema));

      const items = itemsFromClipboard.length
        ? itemsFromClipboard
        : normalizeSliceToDraggableItems(slice, schema).map((node) =>
            normalizeDraggableItemBlock(node, schema),
          );

      if (items.length <= 1 && !hasListItems(rawItems)) return false;

      const { state } = view;
      const { selection } = state;
      const { $from } = selection;
      if (isInsideCodeBlock($from)) return false;
      const depth = findDraggableItemDepth($from);
      if (!depth) return false;

      const node = $from.node(depth);
      const pos = $from.before(depth);
      const startOffset = selection.from - (pos + 1);
      const endOffset = selection.to - (pos + 1);
      if (startOffset < 0 || endOffset > node.content.size) return false;

      const ensureContent = (frag: any) =>
        frag && frag.size
          ? frag
          : Fragment.from(state.schema.nodes.paragraph.create());

      const beforeContent = ensureContent(node.content.cut(0, startOffset));
      const afterContent = ensureContent(node.content.cut(endOffset));

      const beforeNode = node.type.create(node.attrs, beforeContent);
      const afterNode = node.type.create(node.attrs, afterContent);

      const pieces: PMNode[] = [];
      if (!isEmptyDraggableItem(beforeNode)) pieces.push(beforeNode);
      pieces.push(...items);
      if (!isEmptyDraggableItem(afterNode)) pieces.push(afterNode);

      if (!pieces.length) return false;
      const tr = state.tr.replaceWith(
        pos,
        pos + node.nodeSize,
        Fragment.fromArray(pieces),
      );
      if (!tr.docChanged) return false;

      const beforeSize = !isEmptyDraggableItem(beforeNode)
        ? beforeNode.nodeSize
        : 0;
      const itemsSize = items.reduce((sum, n) => sum + n.nodeSize, 0);
      const cursorPos = pos + beforeSize + Math.max(1, itemsSize - 1);
      tr.setSelection(TextSelection.near(tr.doc.resolve(cursorPos)));
      view.dispatch(tr.scrollIntoView());
      event?.preventDefault?.();
      return true;
    };
    return [
      new Plugin({
        props: {
          handlePaste: (view, event, slice) => {
            if (view?.state?.schema?.nodes?.draggableItem) {
              return handleSingleDocPaste(view, event as ClipboardEvent, slice);
            }

            const html = event?.clipboardData?.getData("text/html") ?? "";
            const text = event?.clipboardData?.getData("text/plain") ?? "";

            const items = html
              ? actions.editor.clipboardHtmlToBlocks(html, view.state.schema)
              : actions.editor.plainTextToBlocks(text, view.state.schema);
            if (items.length <= 1) return false;

            event?.preventDefault?.();
            this.options.onPasteSplit?.({
              slice,
              state: view.state,
              itemsOverride: items,
            });
            return true;
          },
        },
      }),
    ];
  },
});
