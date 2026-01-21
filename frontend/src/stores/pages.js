import { defineStore } from 'pinia'
import api from '@/services/api'
import { posBetween } from '@/domain/position'
import { useBlocksStore } from '@/stores/blocks'



function normalizePage(raw) {
    return {
        id: raw.id,
        title: raw.title ? raw.title : 'Untitled',
        parentId: raw.parent,
        position: raw.position,
        createdAt: raw.created_at,
        updatedAt: raw.updated_at,
        icon: raw.icon,
        favorite: raw.favorite,
        favorite_position: raw.favorite_position,

    }
}

const KEY_ROOT = 'root'
const parentKeyOf = (parentId) => parentId == null ? KEY_ROOT : String(parentId)


export const usePagesStore = defineStore('pagesStore', {
    state: () => ({
        //Data
        pages: [],
        pagesById: {},
        childrenByParentId : {},
        expandedById: {},

        currentPageId: null,
        editingPageId: null,
        draftPage: {title: "", },
        originalPage: {title: "", },
        
        pendingFocusTitlePageId: null,

        //Context Menu
        contextMenu: {
            isOpen: false,
            pageId: null,
            anchorRect: null,
        }
    }),
    getters:{
        renderRowsPages: (state) => {
            const pagesMap = state.childrenByParentId ?? {}
            const out = []


            const visit = (parentKey, level) => {
                const childIds = pagesMap[parentKey] ?? []
                
                for(const id of childIds){
                    const page = state.pagesById[id]
                    if(!page) continue
                    out.push({id, level})
                    if(state.expandedById[id]){
                        visit(String(id), level+1)
                    }
                    
                }
            }
            visit(KEY_ROOT,0)
            const flat = out ?? []
            //console.log("OUT:",out)
            return flat
            .map( ({id, level}) => {
                const page = state.pagesById[id]
                return page ? {page, level} : null
            }).filter(Boolean)

        },
        hasChildren: (state) => (pageId) =>{
            const hasChildren= state.childrenByParentId[pageId] ? true:false
            return hasChildren
        },
        isExpanded: (state) => (pageId) => {
            const isExpanded = state.expandedById[pageId] ? true:false
            return isExpanded
        },
        getParentKey: (state) => (parentId) => {
            const parentKey = parentKeyOf(parentId)
            return parentKey
        }
        
    },
    actions:{
        openContextMenu(pageId, anchorRect){
            this.contextMenu= {
                isOpen:true,
                pageId:pageId,
                anchorRect:anchorRect
            }
        },
        closeContextMenu(){
            this.contextMenu= {
                isOpen:false,
                pageId:null,
                anchorRect:null
            }
            
        },
        setContextMenuRect(anchorRect){
            this.contextMenu.anchorRect = anchorRect
        },

        requestTitleFocus(pageId){
            this.pendingFocusTitlePageId = pageId
        },
        consumeTitleFocusRequest(pageId){
            if (this.pendingFocusTitlePageId === pageId) {
                this.pendingFocusTitlePageId = null
                return true
            }
            return false
        },

        async fetchPagesK(){
            try {
            const response = await api.get('/pages/')
            this.pages = response.data
            } catch(error){
                console.warn("Error in pages fetching:", error)
                throw error
            }
        },
        
        async fetchPages(){
            try {
            const response = await api.get('/pages/')
            const pages = response.data
            const normPages = pages.map( (p1) => normalizePage(p1))
            
            this.pagesById = normPages.reduce((dict, page) =>{
                dict[page.id] = page
                return dict
            }, {})

            this.childrenByParentId= normPages.reduce((dict, page)=>{
                const parentKey = parentKeyOf(page.parentId)
                //console.log("PARENT_KEY",parentKey)
                if(!dict[parentKey]) dict[parentKey] = []
                dict[parentKey].push(page.id)
                return dict
            }, {})
            Object.values(this.childrenByParentId).forEach(childIds => {
                childIds.sort((idA, idB) => {
                    const posA = this.pagesById[idA].position ?? '\uffff'
                    const posB = this.pagesById[idB].position ?? '\uffff'
                    const cmp = posA < posB ? -1 : posA>posB ? 1 : 0
                    return cmp !==0 ? cmp : String(idA).localeCompare(String(idB))

                })
            })
            
            //console.log(this.childrenByParentId)
            //console.log(Object.values(this.childrenByParentId))
            } catch(error){
                console.warn("Error in pages fetching:", error)
                throw error
            }
        },
        

        async addPage(payload){
            try{
                await api.post('/pages/', {'title': payload.title})
            }
            catch(error) {
                    console.warn("Error in adding page:", error)
                    throw error
                }
        },
        expandPage(pageId){
            this.expandedById[pageId] =  true
        },
        toggleExpandPage(pageId){
            this.expandedById[pageId] = this.expandedById[pageId] ? false : true
        },
        collapseAll() {
            this.expandedById = {};
        },

        async addChildPage(parentId) {
            try{

                const parentKey = parentKeyOf(parentId)
                const childIds = this.childrenByParentId[parentKey] ?? []
                //console.log("CHILD_IDS:",childIds,childIds.length>0 )
                const lastIdx = childIds.length>0 ? childIds.length - 1 : null
                
                const lastChildId = lastIdx!==null ? childIds[lastIdx] : null
                let lastPos = lastChildId ? this.pagesById[lastChildId].position : null
                lastPos = lastPos ? lastPos : null
                
                //console.log("LAST-idx:", lastIdx, "LAST-CHILDID:", lastChildId, "LAST-pos:", lastPos)
                const newPos = posBetween(lastPos, null)
                



                const res = await api.post('/pages/', {'parent': parentId, 'position': newPos})
                //console.log('before fetchPages expanded',  this.expandedById)
                await this.fetchPages()
                //console.log('after fetchPages expanded',  this.expandedById)
                const newId = res.data.id
                return newId
                //console.log(res.data)
            }
            catch(error) {
                    console.warn("Error in adding page:", error)
                    throw error
                }

        },
        async addPageAfterId(prevPageId) {
            try {
                const prev = this.pagesById[prevPageId]
                if (!prev) {
                // fallback: ricarico e riprovo una volta
                await this.fetchPages()
                const prev2 = this.pagesById[prevPageId]
                if (!prev2) throw new Error(`addPageAfterId: prevPageId ${prevPageId} not found`)
                return await this.addPageAfterId(prevPageId)
                }

                const parentId = prev.parentId ?? null
                const parentKey = parentKeyOf(parentId)

                const siblingIds = this.childrenByParentId[parentKey] ?? []
                // assicuro ordine per position
                const ordered = [...siblingIds].sort((idA, idB) => {
                const posA = this.pagesById[idA]?.position ?? "\uffff"
                const posB = this.pagesById[idB]?.position ?? "\uffff"
                const cmp = posA < posB ? -1 : posA > posB ? 1 : 0
                return cmp !== 0 ? cmp : String(idA).localeCompare(String(idB))
                })

                const idx = ordered.indexOf(prevPageId)
                // se non lo trovo tra i siblings (stato non allineato), meglio rifetch
                if (idx === -1) {
                await this.fetchPages()
                return await this.addPageAfterId(prevPageId)
                }

                const nextId = ordered[idx + 1] ?? null
                const prevPos = this.pagesById[prevPageId]?.position ?? null
                const nextPos = nextId ? (this.pagesById[nextId]?.position ?? null) : null

                const newPos = posBetween(prevPos, nextPos)

                const res = await api.post("/pages/", {
                parent: parentId,
                position: newPos,
                })

                await this.fetchPages()

                return res.data.id
            } catch (error) {
                console.warn("Error in addPageAfterId:", error)
                throw error
            }
            },

        async movePageInside(pageId, newParentId){
            let newPos = null
            const newParentKey = parentKeyOf(newParentId)
            const newSiblingsIds = this.childrenByParentId[newParentKey] ?? []
            const lastSiblingId = newSiblingsIds.at(-1) ? newSiblingsIds.at(-1) : null

            const lastSiblingPos = lastSiblingId ? this.pagesById[lastSiblingId].position : null

            //console.log("LAST POS:", lastSiblingPos)
            newPos = posBetween(lastSiblingPos, null)
            //console.log("NEWPOS",newPos)

            const payload = {
                'parent' : newParentId,
                'position' : newPos
            }
            await this.patchPage(pageId, payload)
            await this.fetchPages()

        },
        async openPage(pageId) {
            try{

                const response = await api.get(`/pages/${pageId}`)
                this.currentPageId = response.data.id
            } catch(error) {
                    console.warn("Error opening page:", error)
                    throw error
                }

        },

        async patchPage(pageId, payload){
            if(String(payload.title).trim()==='') payload.title = 'Untitled'
           const res =  await api.patch(`/pages/${pageId}/`, payload)
           return res

        },


        startEdit(pageId){
            this.editingPageId = pageId
            const page = this.pagesById[pageId]
            this.draftPage = {title: page.title,}
            this.originalPage = {title: page.title,}
        },

        cancelEdit(){
            this.editingPageId = null
            this.draftPage = {title: '',}
            this.originalPage = {title: '',}
        },

        async commitEdit(pageId){
            const page = this.pagesById[pageId]
            try{
                const payload = {'title' : this.draftPage.title}
                await this.patchPage(page.id, payload)
                this.cancelEdit()
                await this.fetchPages()
                } catch(error){ 
                    console.warn("Error editing title:", error)
                    throw error
                }

        },

        async deletePage(pageId){
            try{
                if(this.currentPageId){
                if(this.currentPageId === pageId){
                    //this.currentPageId = null
                }}
                await api.delete(`/pages/${pageId}/`)
                
                await this.fetchPages()
                
            } catch(error) {
                    console.warn("Error deleting page:", error)
                    throw error
                }

        },
        setSiblingsOrder(parentKey, ids) {
            this.childrenByParentId[parentKey] = ids
        },
        setPagePosition(pageId, position) {
            this.pagesById[String(pageId)].position = position
        },
        async movePageToParentAtIndex(pageId, newParentId, insertIndex) {
            pageId = String(pageId)
            const page = this.pagesById[pageId]
            if (!page) return

            const oldParentId = page.parentId ?? null
            const oldKey = parentKeyOf(oldParentId)
            const newKey = parentKeyOf(newParentId)

            const oldSiblings = [...(this.childrenByParentId[oldKey] ?? [])].map(String)
            const newSiblings = oldKey === newKey ? oldSiblings : [...(this.childrenByParentId[newKey] ?? [])].map(String)

            // rimuovi da old
            const filteredOld = oldSiblings.filter(id => id !== pageId)
            this.childrenByParentId[oldKey] = filteredOld

            // inserisci in new
            const filteredNew = (oldKey === newKey ? filteredOld : newSiblings).filter(id => id !== pageId)
            const idx = Math.max(0, Math.min(insertIndex, filteredNew.length))
            filteredNew.splice(idx, 0, pageId)
            this.childrenByParentId[newKey] = filteredNew

            // calcola prev/next nel new
            const prevId = filteredNew[idx - 1] ?? null
            const nextId = filteredNew[idx + 1] ?? null
            const prevPos = prevId ? this.pagesById[prevId]?.position ?? null : null
            const nextPos = nextId ? this.pagesById[nextId]?.position ?? null : null
            const newPos = posBetween(prevPos, nextPos)

            // optimistic page update
            this.pagesById[pageId].parentId = newParentId
            this.pagesById[pageId].position = newPos

            // persist
            await this.patchPage(pageId, { parent: newParentId, position: newPos })
            await this.fetchPages()
        },
        wouldCreateCycle_Page(dragId, candidateParentId) {
            // candidateParentId = nuovo parent che vuoi assegnare a dragId
            if (candidateParentId == null) return false

            const drag = String(dragId)
            let cur = String(candidateParentId)

            while (cur != null) {
                if (cur === drag) return true
                const p = this.pagesById[cur]
                cur = p?.parentId != null ? String(p.parentId) : null
            }
            return false
            },
            
        async duplicatePageDeep(sourcePageId) {
            const blocksStore = useBlocksStore()

            const src = this.pagesById[String(sourcePageId)]
            if (!src) throw new Error('Source page not found')

            // 1) compute new page position (immediately after)
            const parentId = src.parentId ?? null
            const parentKey = parentKeyOf(parentId)
            const siblings = [...(this.childrenByParentId[parentKey] ?? [])].map(String)

            const idx = siblings.indexOf(String(sourcePageId))
            const nextId = idx >= 0 ? (siblings[idx + 1] ?? null) : null

            const nextPos = nextId ? (this.pagesById[String(nextId)]?.position ?? null) : null
            const newPos = posBetween(src.position ?? null, nextPos)

            // 2) create new page (same parent, icon, title)
            const payload = {
                title: `Copy of ${src.title || 'Untitled'}`,
                icon: src.icon ?? '',
                parent: parentId,
                position: newPos,
            }

            // ⬇️ adatta a come crei pagine oggi
            // es: const created = await api.post('/pages/', payload)
            const created = await api.post('/pages/', payload)
            const newPage = created.data
            const newPageId = String(newPage.id)

            // IMPORTANT: inserisci la pagina nello store + siblings order
            // (adatta alle tue funzioni esistenti)
            this.pagesById[newPageId] = normalizePage(newPage)
            // insert right after src
            if (idx >= 0) {
                const nextSibs = siblings.slice()
                nextSibs.splice(idx + 1, 0, newPageId)
                this.childrenByParentId[parentKey] = nextSibs
            }

            // 3) fetch blocks for source page if needed
            await blocksStore.fetchBlocksForPage(String(sourcePageId))

            // 4) get preorder rows (parents before children)
            const rows = blocksStore.renderRowsForPage(String(sourcePageId))

            // 5) clone blocks into new page preserving parent mapping
            const idMap = new Map() // oldBlockId -> newBlockId

            for (const row of rows) {
                const b = row.block
                const oldId = String(b.id)
                const oldParentId = b.parentId != null ? String(b.parentId) : null
                const newParentId = oldParentId ? idMap.get(oldParentId) ?? null : null

                const createPayload = {
                type: b.type,
                content: b.content,           // copia JSON
                position: b.position,         // mantieni fractional index
                parentId: newParentId,        // rimappato
                }

                // ⬇️ adatta all’endpoint che usi per creare blocchi
                // esempio: POST /pages/:pageId/blocks/
                const res = await api.post(`/pages/${newPageId}/blocks/`, createPayload)
                const newBlock = res.data
                idMap.set(oldId, String(newBlock.id))
            }

            // 6) fetch blocks for new page (così UI è consistente)
            await blocksStore.fetchBlocksForPage(newPageId)

            return newPageId
        },

        getNextPageIdAfterDelete(pageId) {
        const id = String(pageId)
        const p = this.pagesById[id]
        if (!p) return null

        const parentId = p.parentId ?? null
        const key = parentKeyOf(parentId)
        const sibs = [...(this.childrenByParentId[key] ?? [])].map(String)
        const idx = sibs.indexOf(id)

        // 1) sorella successiva
        if (idx !== -1 && idx + 1 < sibs.length) return sibs[idx + 1]
        // 2) sorella precedente
        if (idx !== -1 && idx - 1 >= 0) return sibs[idx - 1]
        // 3) parent
        if (parentId != null) return String(parentId)
        // 4) fallback: prima root
        const rootSibs = [...(this.childrenByParentId[parentKeyOf(null)] ?? [])].map(String)
        return rootSibs[0] ?? null
        },
        async reparentChildrenToParent(pageId) {
                console.log("reparenting")
            const id = String(pageId)
            const p = this.pagesById[id]
            if (!p) return

            const fromParentKey = parentKeyOf(id)
            const children = [...(this.childrenByParentId[fromParentKey] ?? [])].map(String)
            if (!children.length) return

            const newParentId = p.parentId ?? null
            const toKey = parentKeyOf(newParentId)
            console.log("toKey:", toKey)
            const dest = [...(this.childrenByParentId[toKey] ?? [])].map(String)

            // posizione in fondo: tra lastPos e null
            const lastId = dest.length ? dest[dest.length - 1] : null
            let prevPos = lastId ? (this.pagesById[lastId]?.position ?? null) : null
                console.log("prevPos:",prevPos)
            for (const childId of children) {
                const child = this.pagesById[childId]
                //console.log("child:",child)
                if (!child) continue

                const newPos = posBetween(prevPos, null)
                prevPos = newPos

                // optimistic local
                child.parentId = newParentId
                child.position = newPos
                console.log("child:",child, "pos:", newPos, "newParent:", newParentId)
                // aggiorna strutture in memoria
                // rimuovi da old children list
                // (ci penserai magari dopo con rebuild, ma facciamolo bene)
                // NB: usiamo arrays locali e poi riassegniamo
                // (per reattività pinia)
                this.childrenByParentId[fromParentKey] = (this.childrenByParentId[fromParentKey] ?? []).filter(x => String(x) !== childId)
                this.childrenByParentId[toKey] = [...(this.childrenByParentId[toKey] ?? []).map(String), childId]

                // persist
                await this.patchPage(childId, { parent: newParentId, position: newPos })
            }
        },
        async movePageToParentAppend(pageId, newParentId) {
            const id = String(pageId)
            const page = this.pagesById[id]
            if (!page) return

            const nextParentId = newParentId == null ? null : String(newParentId)

            // ✅ no-op
            if (String(page.parentId ?? '') === String(nextParentId ?? '')) return

            // ✅ block cycles (usa la tua funzione esistente)
            if (this.wouldCreateCycle_Page?.(id, nextParentId)) return

            const oldParentKey = parentKeyOf(page.parentId ?? null)
            const newParentKey = parentKeyOf(nextParentId)

            const oldSibs = [...(this.childrenByParentId[oldParentKey] ?? [])].map(String)
            const newSibs = [...(this.childrenByParentId[newParentKey] ?? [])].map(String)

            // posizione in fondo
            const lastId = newSibs.length ? newSibs[newSibs.length - 1] : null
            const lastPos = lastId ? (this.pagesById[lastId]?.position ?? null) : null
            const newPos = posBetween(lastPos, null)

            // optimistic: rimuovi da old, appendi a new
            this.childrenByParentId[oldParentKey] = oldSibs.filter(x => x !== id)
            this.childrenByParentId[newParentKey] = [...newSibs, id]

            page.parentId = nextParentId
            page.position = newPos

            // persist
            await this.patchPage(id, { parent: nextParentId, position: newPos })
        },
        ensureVisible(pageId) {
        const id = String(pageId)
        let cur = this.pagesById[id]
        if (!cur) return

        // espandi tutti i parent fino a root
        let parentId = cur.parentId ?? null
        while (parentId != null) {
            const pid = String(parentId)
            this.expandedById[pid] = true
            const p = this.pagesById[pid]
            parentId = p?.parentId ?? null
        }
        },

        updatePageLocationOptimistic(pageId, { newParentId, newPosition }) {
            const page = this.pagesById[pageId];
            if (!page) return; // Safety check
            const oldParentKey = page.parentId || KEY_ROOT;
            const newParentKey = newParentId || KEY_ROOT;

            
            page.parentId = newParentId; 
            page.position = newPosition;

        
            if (this.childrenByParentId[oldParentKey]) {
                this.childrenByParentId[oldParentKey] = this.childrenByParentId[oldParentKey]
                    .filter(id => id !== pageId);
            }

            
            if (!this.childrenByParentId[newParentKey]) {
                this.childrenByParentId[newParentKey] = [];
            }
            
        
            if (!this.childrenByParentId[newParentKey].includes(pageId)) {
                this.childrenByParentId[newParentKey].push(pageId);
            }

        
            this.childrenByParentId[newParentKey].sort((idA, idB) => {
                const posA = this.pagesById[idA]?.position || '';
                const posB = this.pagesById[idB]?.position || '';
                
                // Comparazione stringhe standard (funziona con fractional indexing)
                if (posA < posB) return -1;
                if (posA > posB) return 1;
                return 0;
            });

        
        },
        isCircularMove(draggedId, targetParentId, pagesById) {
            // Se stiamo spostando nella root (null), non può esserci ciclo
            if (!targetParentId || targetParentId === 'root') return false;

            // Se stiamo cercando di droppare su se stessi (impossibile da UI, ma per sicurezza)
            if (draggedId === targetParentId) return true;

            let currentParentId = targetParentId;
            
            while (currentParentId) {
                
                if (currentParentId === draggedId) return true;

                
                const parentNode = pagesById[currentParentId];
                
                
                if (!parentNode) break;
                currentParentId = parentNode.parentId;
            }

            return false;
        },
        childrenOf(parentId) {
            const key = parentId == null ? 'root' : String(parentId)
            return (this.childrenByParentId[key] ?? [])
                .map(id => this.pagesById[String(id)])
                .filter(Boolean)
                .sort((a, b) => a.position.localeCompare(b.position))
            },
        
        async duplicatePageTransactional(sourcePageId) {
            const blocksStore = useBlocksStore()
            console.log("DUPLICATE PAGE TRANSACTIONAL:", sourcePageId)
            const res = await api.post(`/pages/${sourcePageId}/duplicate-deep/`, {
            include_children: true, // o false
            })
            const newPageId = res.data.new_page_id

            await this.fetchPages()
            await blocksStore.fetchBlocksForPage(newPageId)
            return res.data.new_page_id
        },

        async toggleFavorite(pageId) {
            const id = String(pageId)
            const page = this.pagesById[id]
            if (!page) return
            const newFavoriteStatus = !page.favorite

            // Optimistic update
            page.favorite = newFavoriteStatus
            try {
                await this.patchPage(id, { favorite: newFavoriteStatus })
            } catch (error) {
                // Revert in case of error
                page.favorite = !newFavoriteStatus
                console.error("Error toggling favorite status:", error)
            }
        },

        hasFavoritePages() {
            return Object.values(this.pagesById).some(page => page.favorite)
        },
        anyPage(){
            return Object.keys(this.pagesById).length > 0
        }



}

        
        


    
    }
)

export default usePagesStore