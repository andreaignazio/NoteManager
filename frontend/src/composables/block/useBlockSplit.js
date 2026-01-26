import { useBlocksStore } from "@/stores/blocks";
import { useAppActions } from "@/actions/useAppActions";

export function useBlockSplit(editor, pageId, blockId) {
  const blocksStore = useBlocksStore();
  const actions = useAppActions();

  async function handleSplitAndCreate() {
    const ed = editor?.value;
    if (!ed) return;

    const prevContent = JSON.parse(
      JSON.stringify(blocksStore.blocksById?.[blockId]?.content ?? {}),
    );

    const state = ed.state;
    const { from, to } = state.selection;
    const cutPos = Math.min(from, to);

    const fullDoc = state.doc;
    const endPos = fullDoc.content.size;

    // 1) PRENDO LA DESTRA PRIMA DI MODIFICARE
    const rightSlice = fullDoc.slice(cutPos, endPos);

    // 2) COSTRUISCO IL DOC SINISTRO VIA TR (NO deleteRange => NO onUpdate)
    const tr = state.tr.delete(cutPos, endPos);
    const leftDoc = tr.doc;

    // 3) APPLICO SUBITO A TIPTAP SENZA EMETTERE UPDATE
    ed.commands.setContent(leftDoc.toJSON(), { emitUpdate: false });

    // 4) SALVO SINISTRA SU STORE
    const leftJson = leftDoc.toJSON();
    const leftText = leftDoc.textBetween(0, leftDoc.content.size, "\n");
    const nextContent = {
      json: leftJson,
      text: leftText,
    };
    await actions.blocks.updateBlockContent(blockId, nextContent);

    // 5) PREPARO JSON DESTRA (doc valido)
    const rightContentArray = rightSlice.content.toJSON() || [];

    // se la slice produce top-level text, wrappa in paragraph
    let rightDocContent;
    if (!rightContentArray.length) {
      rightDocContent = [{ type: "paragraph" }];
    } else {
      const first = rightContentArray[0];
      const isBlockNode = first && first.type && first.type !== "text";
      rightDocContent = isBlockNode
        ? rightContentArray
        : [{ type: "paragraph", content: rightContentArray }];
    }

    const newBlockJson = { type: "doc", content: rightDocContent };
    const newBlockText = rightSlice.content.textBetween(
      0,
      rightSlice.content.size,
      "\n",
    );

    // 6) TIPO BLOCCO (il tuo backend usa 'p')
    const blockType = blocksStore.blocksById?.[blockId]?.type ?? "p";

    // 7) CREA BLOCCO DOPO
    const newId = await actions.blocks.addNewBlockAfter(
      pageId,
      {
        content: { json: newBlockJson, text: newBlockText },
        type: blockType,
      },
      blockId,
      { undo: false },
    );

    const newBlock = blocksStore.blocksById?.[String(newId)] ?? null;
    if (newBlock) {
      blocksStore.pushUndoEntry({
        pageId: String(pageId),
        undo: {
          ops: [
            {
              op: "update",
              id: String(blockId),
              patch: { content: prevContent },
            },
            { op: "delete", id: String(newId) },
          ],
        },
        redo: {
          ops: [
            {
              op: "update",
              id: String(blockId),
              patch: { content: nextContent },
            },
            {
              op: "create",
              node: {
                id: String(newBlock.id),
                kind: newBlock.kind ?? "block",
                parentId: newBlock.parentId ?? null,
                position: String(newBlock.position ?? ""),
                type: newBlock.type,
                content: newBlock.content ?? {},
                props: newBlock.props ?? {},
                layout: newBlock.layout ?? {},
                width: newBlock.width ?? null,
              },
            },
          ],
        },
        label: "splitBlock",
      });
    }

    actions.blocks.requestFocus(newId, 1);
  }

  return { handleSplitAndCreate };
}
