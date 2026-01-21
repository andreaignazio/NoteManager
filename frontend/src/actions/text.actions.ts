// src/actions/text.actions.ts
import { computed } from "vue"
import { useEditorRegistryStore } from "@/stores/editorRegistry"
import { useUiStore } from "@/stores/ui"

import { DOMSerializer } from "prosemirror-model"
import { get } from "sortablejs"

/**
 * Clipboard interno "rich" come fallback (se permessi clipboard web non disponibili)
 */
type RichClipboard = {
  html: string | null
  text: string | null
  ts: number
}

function canWriteClipboard() {
  return typeof navigator !== "undefined" && !!navigator.clipboard?.write
}

async function writeClipboard({ html, text }: { html: string; text: string }) {
  // Best effort: html + plain
  if (!canWriteClipboard()) return false
  try {
    // ClipboardItem potrebbe non esistere su alcuni browser
    // @ts-ignore
    if (typeof ClipboardItem !== "undefined") {
      // @ts-ignore
      const item = new ClipboardItem({
        "text/plain": new Blob([text], { type: "text/plain" }),
        "text/html": new Blob([html], { type: "text/html" }),
      })
      // @ts-ignore
      await navigator.clipboard.write([item])
      return true
    }

    // fallback: solo testo
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function looksLikeHtml(s: string) {
  return /<\/?[a-z][\s\S]*>/i.test(s)
}

function selectionIsRange(ed: any) {
  const sel = ed?.state?.selection
  if (!sel) return false
  return !sel.empty && sel.from !== sel.to
}

function selectionSliceToHTML(ed: any) {
  const { state } = ed
  const { from, to } = state.selection
  const slice = state.doc.slice(from, to)

  const serializer = DOMSerializer.fromSchema(state.schema)
  const wrap = document.createElement("div")
  wrap.appendChild(serializer.serializeFragment(slice.content))
  return wrap.innerHTML
}

function selectionSliceToText(ed: any) {
  const { state } = ed
  const { from, to } = state.selection
  // textBetween è un modo robusto per estrarre testo dalla slice
  return state.doc.textBetween(from, to, "\n")
}

function editorHasFocus(ed: any) {
  return !!ed?.view?.hasFocus?.()
}







export function useTextActions() {
  const editorReg = useEditorRegistryStore()
  const ui = useUiStore()

  // Fallback internal clipboard (aggiungi questi campi nel tuo ui store)
  // ui.richClipboard = { html:null, text:null, ts:0 }
  const richClipboard = computed(() => (ui as any).richClipboard as RichClipboard | undefined)

  function getEditor(blockId: string) {
    return editorReg.getEditor(blockId)
  }
  function getSelectionRect(ed: any) {
  const { from, to } = ed.state.selection
  const a = ed.view.coordsAtPos(from)
  const b = ed.view.coordsAtPos(to)

  const left = Math.min(a.left, b.left)
  const right = Math.max(a.right, b.right)
  const top = Math.min(a.top, b.top)
  const bottom = Math.max(a.bottom, b.bottom)

  return { left, right, top, bottom, width: right - left, height: bottom - top }
}

function getActiveLinkHref(ed: any): string | null {
  // tiptap: isActive('link') + attrs
  if (!ed.isActive?.('link')) return null
  const attrs = ed.getAttributes?.('link')
  return attrs?.href ?? null
}



  async function copyBlockRich(blockId: string) {
    const ed = getEditor(blockId)
      if (!ed) return

      const hasRange = selectionIsRange(ed)
      console.log("[TextActions] copyBlockRich hasRange=", hasRange)

      const html = hasRange ? selectionSliceToHTML(ed) : (ed.getHTML?.() ?? "")
      const text = hasRange ? selectionSliceToText(ed) : (ed.getText?.() ?? "")

      ;(ui as any).richClipboard = { html, text, ts: Date.now() }
      await writeClipboard({ html, text })
    }

  /**
   * Legge dal clipboard OS se possibile (opzionale).
   * Per evitare permessi/instabilità, usiamo prima l’internal clipboard.
   */
  async function getRichClipboardPayload(): Promise<{ html: string | null; text: string | null }> {
    const mem = richClipboard.value
    if (mem?.html || mem?.text) return { html: mem.html ?? null, text: mem.text ?? null }

    // optional: prova readText (NON richiede sempre permessi ma spesso sì)
    try {
      const t = await navigator.clipboard?.readText?.()
      if (t) return { html: looksLikeHtml(t) ? t : null, text: t }
    } catch {
      /* ignore */
    }
    return { html: null, text: null }
  }

  function moveSelectionToEnd(ed: any) {
    // ProseMirror: posizione fine documento
    const end = ed.state.doc.content.size
    ed.commands.setTextSelection(end)
  }

  async function pasteAppend(blockId: string) {
    const ed = getEditor(blockId)
    if (!ed) return

    const { html, text } = await getRichClipboardPayload()
    const payload = html ?? text
    if (!payload) return

    // Append: sposta cursore alla fine e inserisci contenuto
    ed.chain().focus().command(({ tr }) => {
      // set selection end
      const end = ed.state.doc.content.size
      tr.setSelection(ed.state.selection.constructor.near(tr.doc.resolve(end)))
      return true
    }).run()

    // Se vuoi separare con newline/spazio quando il doc non è vuoto:
    const isEmpty = ed.state.doc.content.size <= 2 // spesso 2 = doc con un paragrafo vuoto
    if (!isEmpty) {
      ed.commands.insertContent("\n")
    }

    ed.commands.insertContent(payload)
  }

  async function pasteSmart(blockId: string) {
    const ed = getEditor(blockId)
    if (!ed) return

    const { html, text } = await getRichClipboardPayload()
    const payload = html ?? text
    if (!payload) return

    // Se l’editor è focusato, incolla dove sei (caret o selection)
    if (editorHasFocus(ed)) {
      ed.chain().focus().insertContent(payload).run()
      return
    }

    // Altrimenti: append come prima
    ed.chain().focus().command(({ tr }) => {
      const end = ed.state.doc.content.size
      tr.setSelection(ed.state.selection.constructor.near(tr.doc.resolve(end)))
      return true
    }).run()

    const isEmpty = ed.state.doc.content.size <= 2
    if (!isEmpty) ed.commands.insertContent("\n")

    ed.commands.insertContent(payload)
  }

  // ==== Formatting ====
  function toggleBold(blockId: string) {
    const ed = getEditor(blockId)
    ed?.chain().focus().toggleBold().run()
  }
  function toggleItalic(blockId: string) {
    const ed = getEditor(blockId)
    ed?.chain().focus().toggleItalic().run()
  }
  function toggleStrike(blockId: string) {
    const ed = getEditor(blockId)
    ed?.chain().focus().toggleStrike().run()
  }
  function toggleUnderline(blockId: string) {
    const ed = getEditor(blockId)
    ed?.chain().focus().toggleUnderline().run()
  }

  // ==== Link (per ora: apertura popover, lo implementiamo dopo) ====
  /*function openLinkPopover(blockId: string) {
    const ed = getEditor(blockId)
    if (!ed) return
    // Qui poi apriamo overlay popover con anchor sulla selection
    // (lasciamo stub, lo colleghiamo dopo)
    ;(ui as any).requestLinkPopover = { blockId, ts: Date.now() }
  }*/

  function unsetLink(blockId: string) {
    const ed = getEditor(blockId)
    ed?.chain().focus().unsetLink().run()
  }


  function setLink(blockId: string, href: string) {
    const ed = getEditor(blockId)
    if (!ed) return
    ed.chain().focus().setLink({ href }).run()
  }

  function removeLinkInSelection(blockId: string) {
  const ed = editorReg.getEditor(blockId)
  if (!ed) return

  const sel = ed.state?.selection
  if (!sel || sel.empty) return // ✅ solo se c’è un range selezionato

  const linkType = ed.state.schema?.marks?.link
  if (!linkType) return

  ed.view.dispatch(
    ed.state.tr.removeMark(sel.from, sel.to, linkType)
  )

  ed.view.focus()
}
function removeLinkInSelectionOrAtCaret(blockId: string) {
  const ed = editorReg.getEditor(blockId)
  if (!ed) return

  const sel = ed.state?.selection
  if (!sel) return

  // ✅ range selezionato: rimuovi link solo nel range
  if (!sel.empty) {
    const linkType = ed.state.schema?.marks?.link
    if (!linkType) return
    ed.view.dispatch(ed.state.tr.removeMark(sel.from, sel.to, linkType))
    ed.view.focus()
    return
  }

  // ✅ fallback: caret (o stored mark) -> unsetLink tiptap
  ed.chain().focus().unsetLink().run()
}

  return {
    copyBlockRich,
    pasteAppend,
    pasteSmart,
    toggleBold,
    toggleItalic,
    toggleStrike,
    toggleUnderline,
    getActiveLinkHref,
    getSelectionRect,
    unsetLink,
    setLink,
    removeLinkInSelection,
    removeLinkInSelectionOrAtCaret
    
  }
}

export default useTextActions
