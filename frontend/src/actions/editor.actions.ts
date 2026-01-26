import { Editor } from "@tiptap/core";

import type { EditorState } from "prosemirror-state";

import { useBlocksStore } from "@/stores/blocks";
import { Node } from "prosemirror-model";
import type { Slice, Node as PMNode, Schema } from "prosemirror-model";
type BatchItems = {
  tempId: string;
  kind: "block";
  type: string;
  content: { text: string; json: any };
  props?: any;
  layout?: any;
  width?: number | null;
  children?: BatchItems[];
};

export function useEditorActions() {
  const blocksStore = useBlocksStore();

  function isDocEmpty(pmDocJson: any): boolean {
    const content = pmDocJson?.content ?? [];
    console.log("isDocEmpty content:", content);
    if (!Array.isArray(content) || content.length === 0) return true;
    if (content.length === 1 && content[0].type === "paragraph") {
      const p = content[0];
      const pContent = p?.content ?? [];
      console.log("isDocEmpty pContent:", pContent);
      console.log(!Array.isArray(pContent) || pContent.length === 0);
      return !Array.isArray(pContent) || pContent.length === 0;
    }
    return false;
  }

  function splitCurrentDoc(state: EditorState) {
    const { from, to } = state.selection;
    const doc = state.doc;

    const before = doc.cut(0, from);
    const after = doc.cut(to, doc.content.size);

    const beforeJson = before.toJSON();
    const afterJson = after.toJSON();

    console.log("splitCurrentDoc:", { beforeJson, afterJson });
    return {
      beforeJson,
      afterJson,
      hasAfter: !isDocEmpty(afterJson),
    };
  }
  function makeTempId(): string {
    return crypto.randomUUID();
  }

  function pmNodeToBlockDocJson(node: PMNode) {
    return { type: "doc", content: [node.toJSON()] };
  }

  function tiptapJsonToPlainText(json: any, schema: Schema): string {
    const doc = Node.fromJSON(schema, json);
    return doc.textContent;
  }

  function sliceToBatchItems(slice: Slice, schema: Schema): BatchItems[] {
    const out: BatchItems[] = [];

    slice.content.forEach((node) => {
      if (node.type.name === "paragraph") {
        out.push({
          tempId: makeTempId(),
          kind: "block",
          type: "p",
          content: {
            text: node.textContent ?? "",
            json: pmNodeToBlockDocJson(node),
          },
        });
        return;
      }
      if (node.isBlock) {
        out.push({
          tempId: makeTempId(),
          kind: "block",
          type: "paragraph",
          content: {
            text: node.textContent ?? "",
            json: pmNodeToBlockDocJson(
              schema.nodes.paragraph.create(null, node.content),
            ),
          },
        });
      }
    });

    if (out.length === 0) {
      const text = slice.content.textBetween(0, slice.content.size, "\n\n");
      out.push({
        tempId: makeTempId(),
        kind: "block",
        type: "paragraph",
        content: {
          text,
          json: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: text ? [{ type: "text", text }] : [],
              },
            ],
          },
        },
      });
    }
    return out;
  }

  async function pasteSplitFlow(args: {
    pageId: string;
    blockId: string;
    parentBlockId: string | null;
    afterBlockId: string;
    editorState: EditorState;
    slice: Slice;
  }) {
    console.log("Editor Action: pasteSplitFlow");
    const { beforeJson, afterJson, hasAfter } = splitCurrentDoc(
      args.editorState,
    );

    blocksStore.patchBlockLocal(args.blockId, {
      content: {
        text: args.editorState.doc.textContent ?? "",
        json: beforeJson,
      },
    });

    const items = sliceToBatchItems(args.slice, args.editorState.schema);
    console.log("PasteSplitFlow Items:", items);

    if (hasAfter) {
      items.push({
        tempId: makeTempId(),
        kind: "block",
        type: blocksStore.blocksById[args.blockId]?.type ?? "p",
        content: {
          text: tiptapJsonToPlainText(afterJson, args.editorState.schema),
          json: afterJson,
        },
      });
    }

    const { topLevelIds, ids } = await blocksStore.batchAddBlocksAfter(
      args.pageId,
      args.afterBlockId,
      items,
      args.parentBlockId,
      { fetch: true },
    );

    const first = topLevelIds?.[0] || ids?.[0];
    if (first) {
      // usa il tuo meccanismo: focusRequestId / scroll / selection
      blocksStore.focusRequestId = { blockId: first, caret: 0 };
      // oppure ui.requestScrollToBlock(first) se ce l’hai
    }

    console.log("pasteSplitFlow ids:", ids, "map:", map);
    //blocksStore.reconcileTempIds(map)

    //blocksStore.insertChildrenAfter()
  }
  return {
    pasteSplitFlow,
  };
}
