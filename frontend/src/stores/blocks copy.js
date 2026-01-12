import { defineStore } from 'pinia'
import api from '@/services/api'
import { DEFAULT_BLOCK_TYPE } from '@/domain/blockTypes'
import { posBetween } from '@/domain/position'
//import { version } from 'react'

function normalizeBlock(raw) {
    return {
    id: raw.id,
    pageId: raw.page,
    parentId: raw.parent_block,
    type: raw.type,
    content: raw.content ?? {text: ''},
    position: raw.position ?? '',
    version: raw.version ?? 1,
    updatedAt: raw.updated_at ?? null,
    }
}

const KEY_ROOT = 'root'
const parentKeyOf = (parentId) => parentId == null ? KEY_ROOT : String(parentId)


export const useBlocksStore = defineStore('blocksStore',{
    state: () => ({
        //data
        blocksById: {},
        blocksByPage: {},
        childrenByParentId: {},
        expandedById: {},

        //selection
        currentBlockId : null,
        focusRequestId: null,
        _fetchTokenByPage: {},


        //options menu
        optionsMenu: {
            open: false,
            blockId: null,
            anchorRect: null,
        }


    }),
    getters: {
        currentBlock(state) {
            return state.currentBlockId ? state.blocksById[state.currentBlockId] : null
        },
        blocksForPage: (state) => (pageId) => {
            return (state.blocksByPage[pageId] ?? []).map(
                (blockId) => state.blocksById[blockId]
            ).filter(Boolean) },
        
        flattenForPage: (state) => (pageId) => {

            const pageMap = state.childrenByParentId[pageId] ?? {}
            const out = []

            const visit = (parentKey, level) => {
                const childIds = pageMap[parentKey] ?? []

                for(const id of childIds){
                    const block = state.blocksById[id]
                    if(!block) continue
                    out.push({id, level})
                    visit(String(id), level+1)
                }
            }

            visit(KEY_ROOT, 0)
            return out
        },

        renderRowsForPage: (state) => (pageId) => {
            const pageMap = state.childrenByParentId[pageId] ?? {}
            const out = []
            
            const visit = (parentKey, level) => {
                const childIds = pageMap[parentKey] ?? []

                for(const id of childIds){
                    const block = state.blocksById[id]
                    if(!block) continue
                    out.push({id, level})
                    visit(String(id), level+1)
                }
            }
            visit(KEY_ROOT, 0)

            const flat= out ?? []
            return flat
            .map( ({id, level}) => {
                const block = state.blocksById[id]
                return block ? {block, level} : null
            }).filter(Boolean)
        },
        

    },
    actions: {

        ensurePageMap(pageId) {
        if (!this.childrenByParentId[pageId]) this.childrenByParentId[pageId] = {}
        },

        getParentKeyOf(parentId){
            return parentKeyOf(parentId)
        },
        setCurrentBlock(blockId) {
            this.currentBlockId = blockId
            //console.log("STORE-SET-BLOCK:", this.currentBlock.content)
        },

        clearCurrentBlock(){
            this.currentBlockId = null
        },

        requestFocus(blockId, caret = 0){
            this.focusRequestId = {blockId : blockId, caret: caret}
        },

        clearFocusRequest(){
            this.focusRequestId = null
        },


        openOptionsMenu(blockId, anchorRect) {
        this.optionsMenu = {
            open: true,
            blockId,
            anchorRect, // { top,left,bottom,right,width,height } oppure solo top/left/bottom
        }
        },

        closeOptionsMenu() {
        this.optionsMenu = {
            open: false,
            blockId: null,
            anchorRect: null
        }
        },
        
        setOptionsMenuAnchor(anchorEl){
            this.optionsMenu.anchorEl=anchorEl
        },

        expandBlock(blockId){
            this.expandedById[blockId] =  true
        },
        toggleExpandBlock(blockId){
            this.expandedById[blockId] = this.expandedById[blockId] ? false : true
        },
        collapseAll() {
            this.expandedById = {};
        },

        //==OPTIMISITIC UI REFACTOR====
        sortSiblingsByPosition(ids) {
            ids.sort((a, b) => {
                a = String(a); b = String(b)
                const pa = this.blocksById[a]?.position ?? '\uffff'
                const pb = this.blocksById[b]?.position ?? '\uffff'
                return pa < pb ? -1 : pa > pb ? 1 : a.localeCompare(b)
            })
            },
            applyMoveLocal(pageId, blockId, { newParentId, newPosition }) {
            blockId = String(blockId)
            const block = this.blocksById[blockId]
            if (!block) return null

            this.ensurePageMap(pageId)

            const oldParentId = block.parentId ?? null
            const oldKey = parentKeyOf(oldParentId)
            const newKey = parentKeyOf(newParentId)

            // snapshot minimal per rollback
            const snapshot = {
                blockId,
                oldParentId,
                oldPosition: block.position,
                oldKey,
                newKey,
                oldArr: [...(this.childrenByParentId[pageId][oldKey] ?? [])].map(String),
                newArr: [...(this.childrenByParentId[pageId][newKey] ?? [])].map(String),
            }

            // aggiorna metadati
            block.parentId = newParentId
            block.position = newPosition

            // rimuovi da old
            const oldList = (this.childrenByParentId[pageId][oldKey] ?? []).map(String).filter(id => id !== blockId)
            this.childrenByParentId[pageId][oldKey] = oldList

            // inserisci in new (senza duplicati)
            const baseNew = (oldKey === newKey ? oldList : (this.childrenByParentId[pageId][newKey] ?? []).map(String))
            const nextNew = baseNew.filter(id => id !== blockId)
            nextNew.push(blockId)
            this.childrenByParentId[pageId][newKey] = nextNew

            // sort
            this.sortSiblingsByPosition(this.childrenByParentId[pageId][newKey])

            return snapshot
            },  

            rollbackMove(pageId, snapshot) {
                if (!snapshot) return
                this.ensurePageMap(pageId)

                const { blockId, oldParentId, oldPosition, oldKey, newKey, oldArr, newArr } = snapshot
                const block = this.blocksById[String(blockId)]
                if (block) {
                    block.parentId = oldParentId
                    block.position = oldPosition
                }
                this.childrenByParentId[pageId][oldKey] = oldArr
                this.childrenByParentId[pageId][newKey] = newArr
            },

            async moveBlock(pageId, blockId, { parentId, position }) {
                const parentNorm = (parentId === 'root' ? null : parentId)

                const snap = this.applyMoveLocal(pageId, blockId, {
                    newParentId: parentNorm,
                    newPosition: String(position),
                })

                try {
                    await this.patchBlock(String(blockId), { parent_block: parentNorm, position: String(position) })
                    // ✅ niente fetch
                } catch (e) {
                    this.rollbackMove(pageId, snap)
                    throw e
                }
            },


        async fetchBlocksForPage(pageId) {
            try {
            const token = (this._fetchTokenByPage[pageId] ?? 0) + 1
            this._fetchTokenByPage[pageId] = token

            const response = await api.get(`/pages/${pageId}/`)
            if (this._fetchTokenByPage[pageId] !== token) return

            const blocks = response.data.blocks
            const normBlocks = blocks.map( bl => normalizeBlock(bl))


            const byId = {}
            for (const b of normBlocks) byId[String(b.id)] = { ...b, id: String(b.id), parentId: b.parentId == null ? null : String(b.parentId) }


            const pageChildren = {}
            for (const b of Object.values(byId)) {
                const pk = parentKeyOf(b.parentId)
                if (!pageChildren[pk]) pageChildren[pk] = []
                pageChildren[pk].push(b.id)
            }

            Object.values(pageChildren).forEach(ids => {
            ids.sort((a, b) => {
            const pa = byId[a]?.position ?? '\uffff'
            const pb = byId[b]?.position ?? '\uffff'
            return pa < pb ? -1 : pa > pb ? 1 : a.localeCompare(b)
            })
            })

            
            this.blocksById = byId
            this.blocksByPage[pageId] = Object.keys(byId)
            this.childrenByParentId[pageId] = pageChildren
            
            } catch(error){
            console.error("Errore caricamento pagina:", error)
            throw error
            }

            const anyBlockForPage= this.blocksByPage[pageId]?.length > 0 ? true : false
            console.log("anyBlockForPage:",anyBlockForPage)
            if(!anyBlockForPage){
                await this.addNewBlockAfter(pageId,{content: null },null)
                return
                //await this.fetchBlocksForPage(pageId)
            }


        },

        applyDeleteLocal(pageId, blockId) {
            blockId = String(blockId)
            const block = this.blocksById[blockId]
            if (!block) return null

            this.ensurePageMap(pageId)

            const parentKey = parentKeyOf(block.parentId)
            const parentArr = [...(this.childrenByParentId[pageId][parentKey] ?? [])].map(String)

            // snapshot minimal
            const snapshot = {
                block: { ...block },
                parentKey,
                parentArr,
            }

            // remove from parent list
            this.childrenByParentId[pageId][parentKey] = parentArr.filter(id => id !== blockId)

            // remove from blocksById
            delete this.blocksById[blockId]

            // UI stuff
            if (this.currentBlockId === blockId) this.currentBlockId = null
            if (this.optionsMenu?.blockId === blockId) this.closeOptionsMenu()

            return snapshot
            },

            rollbackDelete(pageId, snapshot) {
            if (!snapshot) return
            this.ensurePageMap(pageId)

            const id = String(snapshot.block.id)
            this.blocksById[id] = snapshot.block
            this.childrenByParentId[pageId][snapshot.parentKey] = snapshot.parentArr
            },

        async deleteBlock(blockId, pageId) {
            const snap = this.applyDeleteLocal(pageId, blockId)
            try {
                await api.delete(`/blocks/${blockId}/`)
                // ✅ niente fetch su success
            } catch (e) {
                this.rollbackDelete(pageId, snap)
                // oppure fetch hard se preferisci: await this.fetchBlocksForPage(pageId)
                throw e
            }
            },

        async updateBlockContent(blockId, newContent){
            const editedBlock = this.blocksById[blockId]  
            const previousContent = editedBlock.content
            
            editedBlock.content = newContent

            try {
                await api.patch(`/blocks/${blockId}/`, {content: {'text': newContent.text}, })
                //console.log("PATCHED BLOCK:",this.blocksById[blockId] )
            }catch(error) {
                console.warn("Error updating block:", error)
                editedBlock.content = previousContent
                throw error
            }
        },
        async updateBlockType(blockId, newType) {
            const editedBlock = this.blocksById[blockId]  
            const previousType = editedBlock.type
            editedBlock.type = newType
            try {
                await api.patch(`/blocks/${blockId}/`, {type: newType, })
                //console.log("PATCHED BLOCK:",this.blocksById[blockId] )
            }catch(error) {
                console.warn("Error updating block:", error)
                editedBlock.type = previousType
                throw error
            }

        },
        async patchBlock(blockId, payload){
            try {
                const res = await api.patch(`/blocks/${blockId}/`, payload)
                return res.data
                //console.log("PATCHED BLOCK:",this.blocksById[blockId] )
            }catch(error) {
                console.warn("Error updating block:", error)
                throw error
            }

        },

        async addNewBlock(pageId,payload,blockId){
            const key = String(blockId)
            const childIds = this.childrenByParentId[pageId]?.[key] ?? []
            const hasChildren = childIds.length > 0

            if(hasChildren) return await this.addNewBlockAfterAdoptChildren(pageId, payload,blockId)
            else return await this.addNewBlockAfter(pageId, payload,blockId)    

        },

        async addNewBlockAfter(pageId,payload,blockId) {
            try{

                let postData = {}
                if(!blockId){
                    const parentKey = KEY_ROOT
                    const rootIds = this.childrenByParentId[pageId]?.[parentKey] ?? []
                    const lastId = rootIds.length ? rootIds[rootIds.length - 1] : null
                    const lastPos = lastId ? (this.blocksById[lastId]?.position ?? null) : null
                    const newPos = posBetween(lastPos, null)

                    postData= {
                        type : payload.type ?? DEFAULT_BLOCK_TYPE,
                        content: payload.content ?? {text:""},
                        parent_block: null,
                        position: newPos

                    }
                    console.log("postData:", postData)
                } else {
                    const parentBlock = this.blocksById[blockId]
                    if (!parentBlock) throw new Error("parentBlock not found")

                    const parentKey = parentBlock.parentId == null ? KEY_ROOT : String(parentBlock.parentId)
                    const siblingsIds = this.childrenByParentId[pageId]?.[parentKey] ?? []
                    const idx = siblingsIds.indexOf(blockId)
                    if (idx === -1) {
                        throw new Error(`blockId ${blockId} not found in siblings for parentKey=${parentKey}`)
                    }

                    const prevPos = this.blocksById[blockId]?.position ?? null

                    const nextId = (idx + 1 < siblingsIds.length) ? siblingsIds[idx + 1] : null
                    const nextPos = nextId ? (this.blocksById[nextId]?.position ?? null) : null

                    if (nextPos != null && prevPos != null && prevPos >= nextPos) {
                        throw new Error(`Bad order: prevPos >= nextPos (${prevPos} >= ${nextPos})`)
                    }

                    console.log("PREV_POS:", prevPos, "POST_POS:", nextPos)
                    const newPos = posBetween(prevPos, nextPos)
                    

                    postData = {
                        type: payload.type ?? DEFAULT_BLOCK_TYPE,
                        content: payload.content ?? { text: "" },
                        parent_block: parentBlock.parentId,  // null ok
                        position: newPos
                    }
                    }

                const res = await api.post(`/pages/${pageId}/blocks/`, postData)
                //console.log(newPos)
                await this.fetchBlocksForPage(pageId)
                return res.data.id

            }catch(error) {
                console.warn("Error adding new block:", error?.response?.data ?? error)
                throw error
            }
        },

        async addNewBlockAfterAdoptChildren(pageId, payload, blockId) {

            const newId = await this.addNewBlockAfter(pageId, payload,blockId)

            const childKey = String(blockId)
            const childIds = this.childrenByParentId[pageId]?.[childKey] ?? []
            if (!childIds.length) return newId

            for( const childId of childIds) {
                await api.patch(`/blocks/${childId}/`, {
                    parent_block: newId,
                })
            }

            await this.fetchBlocksForPage(pageId)
            return newId


        },

        async indentBlock(pageId, blockId) {
            blockId = String(blockId)
            const block = this.blocksById[blockId]
            if (!block) return

            this.ensurePageMap(pageId)

            const oldKey = parentKeyOf(block.parentId)
            const siblings = (this.childrenByParentId[pageId][oldKey] ?? []).map(String)
            const idx = siblings.indexOf(blockId)
            if (idx <= 0) return

            const newParentId = siblings[idx - 1] // parent = previous sibling
            const newKey = parentKeyOf(newParentId)
            const newSiblings = (this.childrenByParentId[pageId][newKey] ?? []).map(String)

            const lastId = newSiblings.at(-1) ?? null
            const lastPos = lastId ? (this.blocksById[lastId]?.position ?? null) : null
            const newPos = posBetween(lastPos, null)

            const snap = this.applyMoveLocal(pageId, blockId, { newParentId, newPosition: newPos })

            try {
                await this.patchBlock(blockId, { parent_block: newParentId, position: newPos })
            } catch (e) {
                this.rollbackMove(pageId, snap)
                throw e
            }
        },

        async outdentBlock(pageId, blockId) {
            blockId = String(blockId)
            const block = this.blocksById[blockId]
            if (!block?.parentId) return

            this.ensurePageMap(pageId)

            const parentBlock = this.blocksById[String(block.parentId)]
            if (!parentBlock) return

            const oldParentId = String(block.parentId)
            const newParentId = parentBlock.parentId ?? null
            const newKey = parentKeyOf(newParentId)

            const newSiblings = (this.childrenByParentId[pageId][newKey] ?? []).map(String)
            const parentIdx = newSiblings.indexOf(String(oldParentId))
            if (parentIdx === -1) return

            const prevPos = parentBlock.position ?? null
            const nextId = newSiblings[parentIdx + 1] ?? null
            const nextPos = nextId ? (this.blocksById[String(nextId)]?.position ?? null) : null
            const newPos = posBetween(prevPos, nextPos)

            const snap = this.applyMoveLocal(pageId, blockId, { newParentId, newPosition: newPos })

            try {
                await this.patchBlock(blockId, { parent_block: newParentId, position: newPos })
            } catch (e) {
                this.rollbackMove(pageId, snap)
                throw e
            }
            },

        setSiblingsOrder(pageId, parentKey, ids) {
            this.childrenByParentId[pageId][parentKey] = ids
            //console.log("STORE:", this.childrenByParentId[pageId][parentKey])
        },

        setBlockPosition(pageId, blockId, position){
            this.blocksById[String(blockId)].position = position
        },

        async moveBlockInside(pageId, blockId, newParentId) {
            blockId = String(blockId)

            const newKey = parentKeyOf(newParentId)
            const siblingIds = [...(this.childrenByParentId[pageId]?.[newKey] ?? [])].map(String)

            const lastId = siblingIds.at(-1) ?? null
            const lastPos = lastId ? (this.blocksById[lastId]?.position ?? null) : null
            const newPos = posBetween(lastPos, null)

            // optimistic (opzionale ma consigliato)
            this.blocksById[blockId].parentId = newParentId
            this.blocksById[blockId].position = newPos

            await this.patchBlock(blockId, { parent_block: newParentId, position: newPos })
            await this.fetchBlocksForPage(pageId)
            },

        async moveBlockToParentAtIndex(pageId, blockId, newParentId, insertIndex){
            blockId = String(blockId)
            const block = this.blocksById[blockId]
            if (!block) return

            const oldParentId = block.parentId ?? null
            const oldKey = parentKeyOf(oldParentId)
            const newKey = parentKeyOf(newParentId)

            const oldSiblings = [...(this.childrenByParentId[pageId][oldKey] ?? [])].map(String)
            const newSiblings = oldKey === newKey ? oldSiblings : [...(this.childrenByParentId[pageId][newKey] ?? [])].map(String)

            // rimuovi da old
            const filteredOld = oldSiblings.filter(id => id !== blockId)
            this.childrenByParentId[pageId][oldKey] = filteredOld

            // inserisci in new
            const filteredNew = (oldKey === newKey ? filteredOld : newSiblings).filter(id => id !== blockId)
            const idx = Math.max(0, Math.min(insertIndex, filteredNew.length))
            filteredNew.splice(idx, 0, blockId)
            this.childrenByParentId[pageId][newKey] = filteredNew

            // calcola prev/next nel new
            const prevId = filteredNew[idx - 1] ?? null
            const nextId = filteredNew[idx + 1] ?? null
            const prevPos = prevId ? this.blocksById[prevId]?.position ?? null : null
            const nextPos = nextId ? this.blocksById[nextId]?.position ?? null : null
            const newPos = posBetween(prevPos, nextPos)

            // optimistic block update
            this.blocksById[blockId].parentId = newParentId
            this.blocksById[blockId].position = newPos

            // persist
            await this.patchBlock(blockId, { parent_block: newParentId, position: newPos })
            await this.fetchBlocksForPage(pageId)
        },
        wouldCreateCycle_Block(dragId, candidateParentId) {
            if (candidateParentId == null) return false

            const drag = String(dragId)
            let cur = String(candidateParentId)

            while (cur != null) {
                if (cur === drag) return true
                const b = this.blocksById[cur]
                cur = b?.parentId != null ? String(b.parentId) : null
            }
            return false
            },

            isCircularMove(draggedId, targetParentId, blocksById) {
            // Se stiamo spostando nella root (null), non può esserci ciclo
            if (!targetParentId || targetParentId === 'root') return false;

            // Se stiamo cercando di droppare su se stessi (impossibile da UI, ma per sicurezza)
            if (draggedId === targetParentId) return true;

            // RISALITA DELL'ALBERO:
            // Partiamo dal nuovo padre e risaliamo tutti i genitori.
            // Se incontriamo l'ID che stiamo trascinando, è un ciclo!
            let currentParentId = targetParentId;
            
            while (currentParentId) {
                // Trovato! Il nuovo padre è in realtà un figlio (o nipote) dell'elemento trascinato
                if (currentParentId === draggedId) return true;

                // Saliamo di un livello
                const parentNode = blocksById[currentParentId];
                
                // Se non troviamo il nodo (errore dati) o arriviamo a root (null), ci fermiamo
                if (!parentNode) break;
                currentParentId = parentNode.parentId;
            }

            return false;
        },
        updateBlockLocationOptimistic(blockId,pageId, { newParentId, newPosition }) {
            const block = this.blocksById[blockId];
            if (!block) return; // Safety check

            // 1. Definiamo le chiavi per la mappa childrenByParentId
            //    Il backend usa null per root, ma la mappa usa 'root'
            //const KEY_ROOT = 'root';
            
            const oldParentKey = block.parentId || KEY_ROOT;
            const newParentKey = newParentId || KEY_ROOT;

            // 2. Aggiorniamo i metadati della pagina (quello che facevi già)
            block.parentId = newParentId; 
            block.position = newPosition;

            // 3. GESTIONE LISTE (childrenByParentId)
            
            // A. Rimuovi dalla vecchia lista
            if (this.childrenByParentId[pageId][oldParentKey]) {
                this.childrenByParentId[pageId][oldParentKey] = this.childrenByParentId[pageId][oldParentKey]
                    .filter(id => id !== blockId);
            }

            // B. Aggiungi alla nuova lista (se non esiste, creala)
            if (!this.childrenByParentId[pageId][newParentKey]) {
                this.childrenByParentId[pageId][newParentKey] = [];
            }
            
            // Evitiamo duplicati nel caso (raro) di spostamento nella stessa lista
            if (!this.childrenByParentId[pageId][newParentKey].includes(blockId)) {
                this.childrenByParentId[pageId][newParentKey].push(blockId);
            }

            // 4. RIORDINA LA NUOVA LISTA (Il passaggio cruciale!)
            //    Dobbiamo ordinare l'array di ID basandoci sulle position aggiornate
            this.childrenByParentId[pageId][newParentKey].sort((idA, idB) => {
                const posA = this.blocksById[idA]?.position || '';
                const posB = this.blocksById[idB]?.position || '';
                
                // Comparazione stringhe standard (funziona con fractional indexing)
                if (posA < posB) return -1;
                if (posA > posB) return 1;
                return 0;
            });

           
        },
    }
    }



    
)
