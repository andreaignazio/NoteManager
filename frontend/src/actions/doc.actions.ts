import useDocStore from "@/stores/docstore";
import { useEditorRegistryStore } from "@/stores/editorRegistry";

export function useDocActions() {
  const docStore = useDocStore();
  const editorReg = useEditorRegistryStore();

  const docKeyOf = (pageId: string | number) => `doc:${String(pageId)}`;

  async function loadDoc(pageId: string | number) {
    return await docStore.fetchDoc(pageId);
  }

  async function saveDocContent(
    pageId: string | number,
    content: Record<string, any>,
    opts?: { replace?: boolean },
  ) {
    return await docStore.saveDoc(pageId, { content }, opts);
  }

  function setLocalDocContent(
    pageId: string | number,
    content: Record<string, any>,
  ) {
    docStore.setLocalContent(pageId, content);
  }

  function getDocForPage(pageId: string | number) {
    return docStore.docForPage(pageId);
  }

  function clearDoc(pageId: string | number) {
    docStore.clearDoc(pageId);
  }

  function insertNodeAfter(pageId: string | number, pos: number) {
    const docKey = docKeyOf(pageId);
    const ed = editorReg.getEditor(docKey);
    if (!ed) return;

    const node = ed.state.doc.nodeAt(pos);
    if (!node) return;
    const insertPos = pos + node.nodeSize;

    ed.chain()
      .focus()
      .insertContentAt(insertPos, {
        type: "draggableItem",
        content: [{ type: "paragraph" }],
      })
      .run();
    ed.commands?.setTextSelection?.(insertPos + 2);

    docStore.updateDocContent(pageId, ed.getJSON());
  }

  function duplicateNodeAtPos(pageId: string | number, pos: number) {
    const docKey = docKeyOf(pageId);
    const ed = editorReg.getEditor(docKey);
    if (!ed) return;

    const node = ed.state.doc.nodeAt(pos);
    if (!node) return;

    const insertPos = pos + node.nodeSize;
    const json = node.toJSON();

    ed.chain().focus().insertContentAt(insertPos, json).run();
    ed.commands?.setTextSelection?.(insertPos + 1);

    docStore.updateDocContent(pageId, ed.getJSON());
  }

  function deleteNodeAtPos(pageId: string | number, pos: number) {
    const docKey = docKeyOf(pageId);
    const ed = editorReg.getEditor(docKey);
    if (!ed) return;

    const node = ed.state.doc.nodeAt(pos);
    if (!node) return;

    const from = pos;
    const to = pos + node.nodeSize;
    const tr = ed.state.tr.delete(from, to);
    if (tr.docChanged) {
      ed.view.dispatch(tr.scrollIntoView());
      docStore.updateDocContent(pageId, ed.getJSON());
    }
  }

  function moveNodeToPage(
    fromPageId: string | number,
    targetPageId: string | number,
    pos: number,
  ) {
    const fromKey = docKeyOf(fromPageId);
    const fromEd = editorReg.getEditor(fromKey);
    if (!fromEd) return;

    const node = fromEd.state.doc.nodeAt(pos);
    if (!node) return;

    const nodeJson = node.toJSON();
    const deleteFrom = pos;
    const deleteTo = pos + node.nodeSize;

    const tr = fromEd.state.tr.delete(deleteFrom, deleteTo);
    if (tr.docChanged) {
      fromEd.view.dispatch(tr.scrollIntoView());
      docStore.updateDocContent(fromPageId, fromEd.getJSON());
    }

    const targetKey = docKeyOf(targetPageId);
    const targetEd = editorReg.getEditor(targetKey);
    if (targetEd) {
      const endPos = targetEd.state.doc.content.size;
      targetEd.chain().focus().insertContentAt(endPos, nodeJson).run();
      docStore.updateDocContent(targetPageId, targetEd.getJSON());
      return;
    }

    const existing = docStore.docForPage(targetPageId);
    const baseContent = existing?.content ?? { type: "doc", content: [] };
    const baseChildren = Array.isArray(baseContent.content)
      ? baseContent.content
      : [];
    const nextContent = {
      ...baseContent,
      type: "doc",
      content: [...baseChildren, nodeJson],
    };

    docStore.updateDocContent(targetPageId, nextContent);
    docStore.saveDoc(targetPageId, { content: nextContent });
  }

  return {
    loadDoc,
    saveDocContent,
    setLocalDocContent,
    getDocForPage,
    clearDoc,
    insertNodeAfter,
    duplicateNodeAtPos,
    deleteNodeAtPos,
    moveNodeToPage,
  };
}
