import { useBlocksStore } from '@/stores/blocks'

export function useBlockSplit({ pageId, blockId, getEditor, getBlockType, isSplitting }) {
  
    const blocksStore = useBlocksStore()
    async function splitTiptapAtSelection() {
        const ed = getEditor()
        if (!ed) return

        // 1) snapshot dello stato PRIMA di toccare tiptap
        const state = ed.state
        const { from, to } = state.selection
        const cutPos = Math.min(from, to)

        const fullDoc = state.doc
        const endPos = fullDoc.content.size

        // 2) slice destra (da caret a fine)
        const rightSlice = fullDoc.slice(cutPos, endPos)

        // 3) crea JSON sinistro senza la parte destra
        //    (prendiamo il doc e "tagliamo" con una transaction)
        const tr = state.tr.delete(cutPos, endPos)
        const leftDoc = tr.doc

        // 4) Applica LEFT nell’editor senza triggerare onUpdate/autosave
        //    (questa è la chiave per evitare flicker e race)
        ed.commands.setContent(leftDoc.toJSON(), { emitUpdate: false })

        // 5) salva sinistra in store (ora coerente)
        const leftJson = leftDoc.toJSON()
        const leftText = leftDoc.textBetween(0, leftDoc.content.size, '\n')
        await blocksStore.updateBlockContent(blockId, { json: leftJson, text: leftText })

        // 6) costruisci doc valido per la destra
        const rightArray = rightSlice.content?.toJSON?.() || []
        let rightDocContent
        if (!rightArray.length) {
            rightDocContent = [{ type: 'paragraph' }]
        } else {
            const first = rightArray[0]
            const isBlockNode = first && first.type && first.type !== 'text'
            rightDocContent = isBlockNode
            ? rightArray
            : [{ type: 'paragraph', content: rightArray }]
        }

        const newBlockJson = { type: 'doc', content: rightDocContent }
        const newBlockText = rightSlice.content.textBetween(0, rightSlice.content.size, '\n')

        // 7) CREA BLOCCO DOPO quello corrente (qui è fondamentale l’afterId)
        const newId = await blocksStore.addNewBlock(
            pageId,
            { content: { json: newBlockJson, text: newBlockText }, type: getBlockType },
            blockId
        )

        // 8) focus sul nuovo blocco (start safe)
        blocksStore.requestFocus(newId, 1)
        }

        
        return { splitTiptapAtSelection }
}
