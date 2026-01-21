/*import { useBlocksStore } from '@/stores/blocks'

export function useBlockSplit(editor, pageId,blockId){

    const blocksStore = useBlocksStore()
    async function handleSplitAndCreate() {
        if (!editor.value) return

        const { state } = editor.value
        const { from } = state.selection

        // === 1. CALCOLA IL TAGLIO ===
        const endPos = state.doc.content.size
        
        // Crea la slice per la parte destra (mantiene grassetto, corsivo, ecc.)
        const rightSlice = state.doc.slice(from, endPos)

        // === 2. AGGIORNA IL BLOCCO CORRENTE (SINISTRA) ===
        // Cancelliamo fisicamente il contenuto a destra nell'editor attuale
        editor.value.commands.deleteRange({ from, to: endPos })
        
        // Ottieni il JSON aggiornato del blocco corrente (ora accorciato)
        const leftJson = editor.value.getJSON()
        const leftText = editor.value.getText()

        // Salviamo subito il blocco sinistro
        await blocksStore.updateBlockContent(blockId, { 
            json: leftJson,
            text: leftText
        })

        // === 3. PREPARA IL NUOVO BLOCCO (DESTRA) ===
        
        // Convertiamo il contenuto della slice in array JSON
        // rightSlice.content.toJSON() restituisce un array di nodi (o null se vuoto)
        const rightContentArray = rightSlice.content.toJSON() || []

        // Creiamo la struttura completa del documento per il nuovo blocco.
        // Se la slice contiene già nodi block (es. paragraph), NON ri-wrappiamo.
        const newBlockJson = {
            type: 'doc',
            content: rightContentArray.length
            ? rightContentArray
            : [{ type: 'paragraph' }],
        }

        // Calcoliamo il testo puro per il nuovo blocco (opzionale ma utile per il DB)
        // Possiamo usare un editor temporaneo o estrarlo dai nodi, 
        // ma per semplicità qui mandiamo stringa vuota o estraiamo dal textContent della slice se necessario.
        // Nota: ProseMirror Slice ha .content.textBetween se vuoi il testo esatto.
        const newBlockText = rightSlice.content.textBetween(0, rightSlice.content.size, '\n')

        const blockType = blocksStore.blocksById[blockId].type
        // === 4. CREA IL BLOCCO ===
        const newId = await blocksStore.addNewBlockAfter(
            pageId,
            { 
            content: { json: newBlockJson, text: newBlockText }, 
            type: blockType ?? 'p' // O 'text' se vuoi che lo split resetti il tipo
            },
            blockId
        )

        // ProseMirror selection starts at 1 (0 can be invalid)
        blocksStore.requestFocus(newId, 1)
        }

    return {handleSplitAndCreate}
}*/

import { useBlocksStore } from '@/stores/blocks'

export function useBlockSplit(editor, pageId, blockId) {
  const blocksStore = useBlocksStore()

  async function handleSplitAndCreate() {
    const ed = editor?.value
    if (!ed) return

    const state = ed.state
    const { from, to } = state.selection
    const cutPos = Math.min(from, to)

    const fullDoc = state.doc
    const endPos = fullDoc.content.size

    // 1) PRENDO LA DESTRA PRIMA DI MODIFICARE
    const rightSlice = fullDoc.slice(cutPos, endPos)

    // 2) COSTRUISCO IL DOC SINISTRO VIA TR (NO deleteRange => NO onUpdate)
    const tr = state.tr.delete(cutPos, endPos)
    const leftDoc = tr.doc

    // 3) APPLICO SUBITO A TIPTAP SENZA EMETTERE UPDATE
    ed.commands.setContent(leftDoc.toJSON(), { emitUpdate: false })

    // 4) SALVO SINISTRA SU STORE
    const leftJson = leftDoc.toJSON()
    const leftText = leftDoc.textBetween(0, leftDoc.content.size, '\n')
    await blocksStore.updateBlockContent(blockId, { json: leftJson, text: leftText })

    // 5) PREPARO JSON DESTRA (doc valido)
    const rightContentArray = rightSlice.content.toJSON() || []

    // se la slice produce top-level text, wrappa in paragraph
    let rightDocContent
    if (!rightContentArray.length) {
      rightDocContent = [{ type: 'paragraph' }]
    } else {
      const first = rightContentArray[0]
      const isBlockNode = first && first.type && first.type !== 'text'
      rightDocContent = isBlockNode
        ? rightContentArray
        : [{ type: 'paragraph', content: rightContentArray }]
    }

    const newBlockJson = { type: 'doc', content: rightDocContent }
    const newBlockText = rightSlice.content.textBetween(0, rightSlice.content.size, '\n')

    // 6) TIPO BLOCCO (il tuo backend usa 'p')
    const blockType = blocksStore.blocksById?.[blockId]?.type ?? 'p'

    // 7) CREA BLOCCO DOPO
    const newId = await blocksStore.addNewBlockAfter(
      pageId,
      {
        content: { json: newBlockJson, text: newBlockText },
        type: blockType,
      },
      blockId
    )

    blocksStore.requestFocus(newId, 1)
  }

  return { handleSplitAndCreate }
}
