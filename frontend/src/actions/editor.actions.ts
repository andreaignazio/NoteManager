import { Editor } from "@tiptap/core";

import type { EditorState } from "prosemirror-state";

import { useBlocksStore } from "@/stores/blocks";
import { Node } from "prosemirror-model";
import type { Slice, Node as PMNode, Schema } from "prosemirror-model";
import { DOMParser as PMDOMParser } from "prosemirror-model";
import type { BatchBlockItem } from "@/stores/blocks/types";

//import { clipboardHtmlToBlocks } from "./editor/clipboardHtmlToBlocks";

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

  function sliceToBatchItems(slice: Slice, schema: Schema): BatchBlockItem[] {
    const out: BatchBlockItem[] = [];

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

  function htmlInlineToPmDocJson(inlineHtml: string, schema: Schema) {
    // Wrappo in <p> così ottengo sempre un doc parseabile col tuo schema (paragraph-only)
    const dom = new DOMParser().parseFromString(
      `<p>${inlineHtml}</p>`,
      "text/html",
    );
    const p = dom.body.firstElementChild as HTMLElement;
    const pmDoc = PMDOMParser.fromSchema(schema).parse(p);
    return pmDoc.toJSON();
  }

  function makeTextBlock(
    type: string,
    el: HTMLElement,
    schema: Schema,
  ): BatchBlockItem {
    const html = el.innerHTML ?? "";
    const text = (el.textContent ?? "").replace(/\u00a0/g, " ").trimEnd();
    const json = htmlInlineToPmDocJson(html, schema);

    return {
      tempId: makeTempId(),
      kind: "block",
      type, // "p"|"h1"|"ul"|...
      content: { text, json },
    };
  }

  function makeDivider(): BatchBlockItem {
    return {
      tempId: makeTempId(),
      kind: "block",
      type: "divider",
      content: { text: "", json: null },
    };
  }

  function detectCodeLang(codeEl: HTMLElement): string | undefined {
    // <code class="language-ts"> or <code class="lang-ts">
    const cls = codeEl.getAttribute("class") ?? "";
    const m = cls.match(/\b(language|lang)-([a-z0-9_+-]+)\b/i);
    return m?.[2]?.toLowerCase();
  }

  function makeCodeBlock(
    preOrCode: HTMLElement,
    schema: Schema,
  ): BatchBlockItem {
    const codeEl =
      preOrCode.tagName.toLowerCase() === "code"
        ? preOrCode
        : (preOrCode.querySelector("code") as HTMLElement | null);

    const text = ((codeEl ?? preOrCode).textContent ?? "").replace(
      /\u00a0/g,
      " ",
    );
    const language = codeEl ? detectCodeLang(codeEl) : undefined;

    // Per ora json lo salvo come paragraph con text (marks non rilevanti in code)
    const json = htmlInlineToPmDocJson(escapeHtml(text), schema);

    return {
      tempId: makeTempId(),
      kind: "block",
      type: "code",
      content: { text, json, language: language ?? "plaintext" },
    };
  }

  function escapeHtml(s: string) {
    return s
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function hasBlockChildren(el: HTMLElement) {
    for (const c of Array.from(el.children)) {
      const t = (c as HTMLElement).tagName.toLowerCase();
      if (
        [
          "p",
          "div",
          "h1",
          "h2",
          "h3",
          "ul",
          "ol",
          "pre",
          "blockquote",
          "hr",
        ].includes(t)
      ) {
        return true;
      }
    }
    return false;
  }

  function elementToBlocks(el: HTMLElement, schema: Schema): BatchBlockItem[] {
    const tag = el.tagName.toLowerCase();

    if (tag === "h1" || tag === "h2" || tag === "h3") {
      return [makeTextBlock(tag, el, schema)];
    }

    if (tag === "p") {
      const txt = (el.textContent ?? "").trim();
      if (!txt) return []; // evita blocchi vuoti da paste
      return [makeTextBlock("p", el, schema)];
    }

    if (tag === "blockquote") {
      return [makeTextBlock("quote", el, schema)];
    }

    if (tag === "hr") {
      return [makeDivider()];
    }

    if (tag === "pre") {
      return [makeCodeBlock(el, schema)];
    }

    if (tag === "ul") return listToBlocks(el, schema, "ul");
    if (tag === "ol") return listToBlocks(el, schema, "ol");

    if (tag === "div") {
      // div wrapper: se contiene roba block, espandi
      if (hasBlockChildren(el)) {
        const out: BatchBlockItem[] = [];
        for (const child of Array.from(el.children)) {
          out.push(...elementToBlocks(child as HTMLElement, schema));
        }
        return out;
      }
      // altrimenti trattalo come paragraph
      const txt = (el.textContent ?? "").trim();
      if (!txt) return [];
      return [makeTextBlock("p", el, schema)];
    }

    // fallback: tenta come paragraph se c’è testo
    const txt = (el.textContent ?? "").trim();
    if (!txt) return [];
    return [makeTextBlock("p", el, schema)];
  }

  function extractLiInlineHtml(li: HTMLElement): {
    html: string;
    text: string;
  } {
    // Rimuovi sublists dal clone
    const clone = li.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("ul,ol").forEach((n) => n.remove());

    // Caso comune: <li><p>...</p></li>
    const p = clone.querySelector(":scope > p");
    if (p) {
      return { html: p.innerHTML ?? "", text: (p.textContent ?? "").trimEnd() };
    }

    // Altro caso: <li><div>...</div></li>
    const div = clone.querySelector(":scope > div");
    if (div) {
      return {
        html: div.innerHTML ?? "",
        text: (div.textContent ?? "").trimEnd(),
      };
    }

    // Fallback: usa il contenuto diretto del li (senza ul/ol)
    return {
      html: clone.innerHTML ?? "",
      text: (clone.textContent ?? "").trimEnd(),
    };
  }

  function makeTextBlockFromInline(
    type: string,
    inlineHtml: string,
    inlineText: string,
    schema: Schema,
  ): BatchBlockItem {
    const safeHtml = inlineHtml; // viene dal clipboard, ok; se vuoi sanitizza
    const json = htmlInlineToPmDocJson(safeHtml, schema);
    return {
      tempId: makeTempId(),
      kind: "block",
      type,
      content: { text: inlineText, json },
    };
  }

  function getImmediateSublists(li: HTMLElement): HTMLElement[] {
    const lists = Array.from(li.querySelectorAll("ul,ol")) as HTMLElement[];
    return lists.filter((lst) => {
      // vogliamo liste che appartengono a QUESTO li, non a li figli
      const closestLi = lst.closest("li");
      if (closestLi !== li) return false;

      // accetta:
      // - <li><ul>...</ul></li>
      // - <li><div><ul>...</ul></div></li>
      const parent = lst.parentElement;
      if (!parent) return false;
      return parent === li || parent.parentElement === li;
    });
  }

  function parseListMarker(text: string): {
    type: "ul" | "ol" | null;
    clean: string;
  } {
    const t = text.replace(/\u00a0/g, " ").trimStart();

    // ordered: "1. xxx" / "1) xxx"
    const om = t.match(/^(\d+)[\.\)]\s+(.*)$/);
    if (om) return { type: "ol", clean: om[2] };

    // unordered: "• xxx" / "- xxx" / "* xxx"
    const bm = t.match(/^(?:•|-|\*)\s+(.*)$/);
    if (bm) return { type: "ul", clean: bm[1] };

    return { type: null, clean: t };
  }

  function getIndentPx(el: HTMLElement): number {
    const style = el.getAttribute("style") ?? "";
    const m1 = style.match(/margin-left:\s*([0-9.]+)px/i);
    const p1 = style.match(/padding-left:\s*([0-9.]+)px/i);
    const px = m1 ? Number(m1[1]) : p1 ? Number(p1[1]) : 0;
    return Number.isFinite(px) ? px : 0;
  }

  function paragraphsToListTree(
    paras: HTMLElement[],
    schema: Schema,
  ): BatchBlockItem[] {
    const out: BatchBlockItem[] = [];
    const stack: { indent: number; node: BatchBlockItem }[] = [];

    const pushAtIndent = (indent: number, node: BatchBlockItem) => {
      while (stack.length && stack[stack.length - 1].indent >= indent)
        stack.pop();
      if (!stack.length) out.push(node);
      else {
        const parent = stack[stack.length - 1].node;
        if (!parent.children) parent.children = [];
        parent.children.push(node);
      }
      stack.push({ indent, node });
    };

    for (const p of paras) {
      const rawText = (p.textContent ?? "").trimEnd();
      const { type, clean } = parseListMarker(rawText);
      if (!type) continue;

      // inline HTML: togliamo il marker anche dall’HTML (semplice: usa text clean in json)
      // Se vuoi mantenere marks, qui puoi fare una rimozione marker più sofisticata.
      const indent = getIndentPx(p);
      const json = htmlInlineToPmDocJson(escapeHtml(clean), schema);

      const node: BatchBlockItem = {
        tempId: makeTempId(),
        kind: "block",
        type, // "ul" | "ol"
        content: { text: clean, json },
      };

      pushAtIndent(indent, node);
    }

    return out;
  }

  function isBlockTag(tag: string) {
    return ["p", "div", "blockquote", "pre", "ul", "ol", "hr"].includes(tag);
  }

  function firstBlockChild(li: HTMLElement): HTMLElement | null {
    // primo figlio block “utile” del li
    for (const child of Array.from(li.children) as HTMLElement[]) {
      const t = child.tagName.toLowerCase();
      if (isBlockTag(t)) return child;
    }
    return null;
  }

  function listToBlocks(
    listEl: HTMLElement,
    schema: Schema,
    listType: "ul" | "ol",
  ): BatchBlockItem[] {
    const out: BatchBlockItem[] = [];
    const liEls = Array.from(listEl.children).filter(
      (c) => (c as HTMLElement).tagName.toLowerCase() === "li",
    ) as HTMLElement[];

    for (const li of liEls) {
      // 1) titolo: di solito il primo <p> o contenuto inline
      const titleEl = firstBlockChild(li); // spesso <p>
      let titleHtml = "";
      let titleText = "";

      if (titleEl && titleEl.tagName.toLowerCase() === "p") {
        titleHtml = titleEl.innerHTML ?? "";
        titleText = (titleEl.textContent ?? "").trimEnd();
      } else {
        // fallback: inline del li senza sublists
        const { html, text } = extractLiInlineHtml(li);
        titleHtml = html;
        titleText = text;
      }

      const itemBlock = makeTextBlockFromInline(
        listType,
        titleHtml,
        titleText,
        schema,
      );

      // 2) children: tutto il resto dentro li (block-level), escluso il titolo usato
      const children: BatchBlockItem[] = [];

      for (const child of Array.from(li.children) as HTMLElement[]) {
        if (titleEl && child === titleEl) continue;

        const t = child.tagName.toLowerCase();
        if (!isBlockTag(t)) continue;

        if (t === "ul" || t === "ol") {
          children.push(...listToBlocks(child, schema, t as "ul" | "ol"));
        } else if (t === "div") {
          // div wrapper: espandi
          for (const sub of Array.from(child.children) as HTMLElement[]) {
            children.push(...elementToBlocks(sub, schema));
          }
        } else {
          children.push(...elementToBlocks(child, schema));
        }
      }

      if (children.length) itemBlock.children = children;

      out.push(itemBlock);
    }

    return out;
  }

  function clipboardHtmlToBlocks(
    html: string,
    schema: Schema,
  ): BatchBlockItem[] {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const body = doc.body;

    // Se ci sono vere ul/ol, usa il parser normale
    if (body.querySelector("ul,ol")) {
      const out: BatchBlockItem[] = [];
      for (const el of Array.from(body.children) as HTMLElement[]) {
        out.push(...elementToBlocks(el, schema));
      }
      return out;
    }

    // Fallback: molte volte le “liste” arrivano come <p>• ...</p>
    const ps = Array.from(body.querySelectorAll("p")) as HTMLElement[];
    const listLike = ps.filter(
      (p) => parseListMarker((p.textContent ?? "").trim()).type !== null,
    );

    // Heuristic: se almeno 2 righe list-like, trattale come lista
    if (listLike.length >= 2) {
      // Qui puoi anche mischiare: heading + paragrafi normali + lista.
      // Versione semplice: converti TUTTI i <p> list-like in lista, e gli altri <p> in "p".
      const out: BatchBlockItem[] = [];

      // 1) lista tree da p “list-like”
      out.push(...paragraphsToListTree(ps, schema));

      // 2) (opzionale) aggiungi i <p> non list-like come paragrafi normali
      // Se vuoi preservare l’ordine reale, serve un pass unico (te lo faccio se vuoi).
      const normalPs = ps.filter(
        (p) => parseListMarker((p.textContent ?? "").trim()).type === null,
      );
      for (const p of normalPs) out.push(makeTextBlock("p", p, schema));

      return out;
    }

    // Default: parser normale
    const out: BatchBlockItem[] = [];
    for (const el of Array.from(body.children) as HTMLElement[]) {
      out.push(...elementToBlocks(el, schema));
    }
    return out;
  }

  function plainTextToBlocks(text: string, schema: Schema): BatchBlockItem[] {
    const lines = (text ?? "").replace(/\r\n/g, "\n").split("\n");

    const out: BatchBlockItem[] = [];
    const stack: { indent: number; lastItem: BatchBlockItem }[] = [];

    const pushItemAtIndent = (indent: number, item: BatchBlockItem) => {
      while (stack.length && stack[stack.length - 1].indent >= indent)
        stack.pop();
      if (!stack.length) {
        out.push(item);
      } else {
        const parent = stack[stack.length - 1].lastItem;
        if (!parent.children) parent.children = [];
        parent.children.push(item);
      }
      stack.push({ indent, lastItem: item });
    };

    for (const raw of lines) {
      const line = raw.replace(/\u00a0/g, " ");
      if (!line.trim()) {
        stack.length = 0;
        continue;
      }

      const indent = line.match(/^\s*/)?.[0]?.length ?? 0;

      // headings markdown: # ## ###
      const hm = line.trim().match(/^(#{1,3})\s+(.*)$/);
      if (hm) {
        const level = hm[1].length;
        const type = level === 1 ? "h1" : level === 2 ? "h2" : "h3";
        const txt = hm[2];
        out.push({
          tempId: makeTempId(),
          kind: "block",
          type,
          content: {
            text: txt,
            json: htmlInlineToPmDocJson(escapeHtml(txt), schema),
          },
        });
        stack.length = 0;
        continue;
      }

      // ordered list: "1. "
      const om = line.trim().match(/^(\d+)\.\s+(.*)$/);
      if (om) {
        const txt = om[2];
        const item: BatchBlockItem = {
          tempId: makeTempId(),
          kind: "block",
          type: "ol",
          content: {
            text: txt,
            json: htmlInlineToPmDocJson(escapeHtml(txt), schema),
          },
        };
        pushItemAtIndent(indent, item);
        continue;
      }

      // bullet: "- " or "* "
      const bm = line.trim().match(/^[-*]\s+(.*)$/);
      if (bm) {
        const txt = bm[1];
        const item: BatchBlockItem = {
          tempId: makeTempId(),
          kind: "block",
          type: "ul",
          content: {
            text: txt,
            json: htmlInlineToPmDocJson(escapeHtml(txt), schema),
          },
        };
        pushItemAtIndent(indent, item);
        continue;
      }

      // normale paragraph
      const txt = line.trim();
      out.push({
        tempId: makeTempId(),
        kind: "block",
        type: "p",
        content: {
          text: txt,
          json: htmlInlineToPmDocJson(escapeHtml(txt), schema),
        },
      });
      stack.length = 0;
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
    itemsOverride: BatchBlockItem[];
  }) {
    console.log("Editor Action: pasteSplitFlow");
    const { beforeJson, afterJson, hasAfter } = splitCurrentDoc(
      args.editorState,
    );

    const prevContent = JSON.parse(
      JSON.stringify(blocksStore.blocksById[args.blockId]?.content ?? {}),
    );
    const nextContent = {
      text: args.editorState.doc.textContent ?? "",
      json: beforeJson,
    };

    //const items = sliceToBatchItems(args.slice, args.editorState.schema);
    const items = args.itemsOverride;
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

    let contentPatched = false;
    let topLevelIds: string[] = [];
    let ids: string[] = [];

    try {
      await blocksStore.patchBlockOptimistic(args.blockId, {
        content: nextContent,
      });
      contentPatched = true;

      const res = await blocksStore.batchAddBlocksAfter(
        args.pageId,
        args.afterBlockId,
        items,
        args.parentBlockId,
      );
      topLevelIds = res.topLevelIds;
      ids = res.ids;
    } catch (error) {
      if (contentPatched) {
        try {
          await blocksStore.patchBlockOptimistic(args.blockId, {
            content: prevContent,
          });
        } catch (rollbackError) {
          console.warn("pasteSplitFlow rollback error:", rollbackError);
        }
      }
      throw error;
    }

    const first = topLevelIds?.[0] || ids?.[0];
    if (first) {
      // usa il tuo meccanismo: focusRequestId / scroll / selection
      blocksStore.focusRequestId = { blockId: first, caret: 0 };
      // oppure ui.requestScrollToBlock(first) se ce l’hai
    }

    const createdIds = (ids?.length ? ids : topLevelIds).map(String);
    if (createdIds.length) {
      const deleteIds = [...createdIds].reverse();

      const undoOps = [
        {
          op: "update" as const,
          id: String(args.blockId),
          patch: { content: prevContent },
        },
        ...deleteIds.map((id) => ({ op: "delete" as const, id })),
      ];

      const redoOps = [
        {
          op: "update" as const,
          id: String(args.blockId),
          patch: { content: nextContent },
        },
        ...createdIds
          .map((id) => blocksStore.blocksById[id])
          .filter(Boolean)
          .map((b) => ({
            op: "create" as const,
            node: {
              id: b.id,
              kind: b.kind ?? "block",
              parentId: b.parentId ?? null,
              position: String(b.position ?? ""),
              type: b.type,
              content: b.content ?? {},
              props: b.props ?? {},
              layout: b.layout ?? {},
              width: b.width ?? null,
            },
          })),
      ];

      blocksStore.pushUndoEntry({
        pageId: String(args.pageId),
        undo: { ops: undoOps },
        redo: { ops: redoOps },
        label: "pasteSplitFlow",
      });
    }

    //console.log("pasteSplitFlow ids:", ids, "map:", map);
    //blocksStore.reconcileTempIds(map)

    //blocksStore.insertChildrenAfter()
  }
  return {
    pasteSplitFlow,
    clipboardHtmlToBlocks,
    plainTextToBlocks,
  };
}
