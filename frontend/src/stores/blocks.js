import { defineStore } from 'pinia'
import api from '@/services/api'
import { DEFAULT_BLOCK_TYPE } from '@/domain/blockTypes'
import { posBetween } from '@/domain/position'

function normalizeBlock(raw) {
  return {
    id: String(raw.id),
    pageId: String(raw.page),
    parentId: raw.parent_block == null ? null : String(raw.parent_block),
    type: raw.type,
    content: raw.content ?? { text: '' },
    position: raw.position ?? '',
    version: raw.version ?? 1,
    updatedAt: raw.updated_at ?? null,
  }
}

const KEY_ROOT = 'root'
const parentKeyOf = (parentId) => (parentId == null ? KEY_ROOT : String(parentId))
const normalizeParentForApi = (pid) => (pid === 'root' || pid === undefined ? null : pid)

export const useBlocksStore = defineStore('blocksStore', {
  state: () => ({
    // data
    blocksById: {},
    blocksByPage: {},
    childrenByParentId: {},
    expandedById: {},

    // selection
    currentBlockId: null,
    focusRequestId: null,

    // options menu
    optionsMenu: {
      open: false,
      blockId: null,
      anchorRect: null,
    },

    // anti-race fetch
    _fetchTokenByPage: {},
  }),

  getters: {
    currentBlock(state) {
      return state.currentBlockId ? state.blocksById[state.currentBlockId] : null
    },

    blocksForPage: (state) => (pageId) => {
      return (state.blocksByPage[pageId] ?? [])
        .map((blockId) => state.blocksById[blockId])
        .filter(Boolean)
    },

    flattenForPage: (state) => (pageId) => {
      const pageMap = state.childrenByParentId[pageId] ?? {}
      const out = []

      const visit = (parentKey, level) => {
        const childIds = pageMap[parentKey] ?? []
        for (const id of childIds) {
          const block = state.blocksById[id]
          if (!block) continue
          out.push({ id, level })
          visit(String(id), level + 1)
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
        for (const id of childIds) {
          const block = state.blocksById[id]
          if (!block) continue
          out.push({ id, level })
          visit(String(id), level + 1)
        }
      }

      visit(KEY_ROOT, 0)

      return (out ?? [])
        .map(({ id, level }) => {
          const block = state.blocksById[id]
          return block ? { block, level } : null
        })
        .filter(Boolean)
    },
  },

  actions: {
    // -----------------------------
    // Helpers (internal)
    // -----------------------------
    ensurePageMap(pageId) {
      if (!this.childrenByParentId[pageId]) this.childrenByParentId[pageId] = {}
    },

    sortSiblingsByPosition(ids) {
      ids.sort((a, b) => {
        a = String(a)
        b = String(b)
        const pa = this.blocksById[a]?.position ?? '\uffff'
        const pb = this.blocksById[b]?.position ?? '\uffff'
        return pa < pb ? -1 : pa > pb ? 1 : a.localeCompare(b)
      })
    },

    applyMoveLocal(pageId, blockId, { newParentId, newPosition }) {
      blockId = String(blockId)
      const block = this.blocksById[blockId]
      if (!block) return false

      this.ensurePageMap(pageId)

      const oldKey = parentKeyOf(block.parentId)
      const newKey = parentKeyOf(newParentId)

      // update metadata
      block.parentId = newParentId
      block.position = newPosition

      // remove from old list
      const oldList = (this.childrenByParentId[pageId][oldKey] ?? [])
        .map(String)
        .filter((id) => id !== blockId)
      this.childrenByParentId[pageId][oldKey] = oldList

      // insert into new list (avoid dup)
      const baseNew =
        oldKey === newKey
          ? oldList
          : (this.childrenByParentId[pageId][newKey] ?? []).map(String)

      const nextNew = baseNew.filter((id) => id !== blockId)
      nextNew.push(blockId)
      this.childrenByParentId[pageId][newKey] = nextNew

      this.sortSiblingsByPosition(this.childrenByParentId[pageId][newKey])
      return true
    },

    applyDeleteLocal(pageId, blockId) {
      blockId = String(blockId)
      const block = this.blocksById[blockId]
      if (!block) return false

      this.ensurePageMap(pageId)

      const parentKey = parentKeyOf(block.parentId)
      const arr = (this.childrenByParentId[pageId][parentKey] ?? []).map(String)
      this.childrenByParentId[pageId][parentKey] = arr.filter((id) => id !== blockId)

      delete this.blocksById[blockId]

      if (this.currentBlockId === blockId) this.currentBlockId = null
      if (this.optionsMenu?.blockId === blockId) this.closeOptionsMenu()

      return true
    },

    getParentKeyOf(parentId) {
      return parentKeyOf(parentId)
    },

    // -----------------------------
    // Selection / focus / menu
    // -----------------------------
    setCurrentBlock(blockId) {
      this.currentBlockId = String(blockId)
    },

    clearCurrentBlock() {
      this.currentBlockId = null
    },

    requestFocus(blockId, caret = 0) {
      this.focusRequestId = { blockId: String(blockId), caret }
    },

    clearFocusRequest() {
      this.focusRequestId = null
    },

    openOptionsMenu(blockId, anchorRect) {
      this.optionsMenu = { open: true, blockId: String(blockId), anchorRect }
    },

    closeOptionsMenu() {
      this.optionsMenu = { open: false, blockId: null, anchorRect: null }
    },

    setOptionsMenuAnchor(anchorEl) {
      // (non usata nel flow attuale, ma la lascio)
      this.optionsMenu.anchorEl = anchorEl
    },

    expandBlock(blockId) {
      this.expandedById[String(blockId)] = true
    },

    toggleExpandBlock(blockId) {
      const id = String(blockId)
      this.expandedById[id] = this.expandedById[id] ? false : true
    },

    collapseAll() {
      this.expandedById = {}
    },

    // -----------------------------
    // Fetch (replace totale) + anti-race token
    // -----------------------------
    async fetchBlocksForPage(pageId) {
      const token = (this._fetchTokenByPage[pageId] ?? 0) + 1
      this._fetchTokenByPage[pageId] = token

      try {
        const response = await api.get(`/pages/${pageId}/`)
        if (this._fetchTokenByPage[pageId] !== token) return

        const blocks = response.data.blocks ?? []
        const normBlocks = blocks.map((b) => normalizeBlock(b))

        // replace blocksById (globale): oggi lo fai così, ok.
        // (In futuro potremmo farlo per-page, ma per ora restiamo coerenti col tuo store.)
        this.blocksById = normBlocks.reduce((dict, b) => {
          dict[b.id] = b
          return dict
        }, {})

        this.blocksByPage[pageId] = normBlocks.map((b) => b.id)

        // rebuild children map for page
        const pageMap = normBlocks.reduce((dict, b) => {
          const parentKey = parentKeyOf(b.parentId)
          if (!dict[parentKey]) dict[parentKey] = []
          dict[parentKey].push(b.id)
          return dict
        }, {})

        Object.values(pageMap).forEach((childIds) => {
          childIds.sort((idA, idB) => {
            const posA = this.blocksById[idA]?.position ?? '\uffff'
            const posB = this.blocksById[idB]?.position ?? '\uffff'
            const cmp = posA < posB ? -1 : posA > posB ? 1 : 0
            return cmp !== 0 ? cmp : String(idA).localeCompare(String(idB))
          })
        })

        this.childrenByParentId[pageId] = pageMap
      } catch (error) {
        console.error('Errore caricamento pagina:', error)
        throw error
      }

      const anyBlockForPage = (this.blocksByPage[pageId]?.length ?? 0) > 0

      // Se la pagina è vuota, crea il primo blocco (con type valido!)
      if (!anyBlockForPage) {
        await this.addNewBlock(pageId, { type: DEFAULT_BLOCK_TYPE, content: { text: '' } }, null)
        // non serve refetch: addNewBlock oggi fa fetch internamente
        return
      }
    },

    // -----------------------------
    // Persist helpers
    // -----------------------------
    async patchBlock(blockId, payload) {
      try {
        const res = await api.patch(`/blocks/${blockId}/`, payload)
        return res.data
      } catch (error) {
        console.warn('Error patching block:', error?.response?.data ?? error)
        throw error
      }
    },

    // -----------------------------
    // UI-Optimistic Actions (Phase A)
    // -----------------------------

    // Dragdrop move: optimistic immediately, fetch hard only on error
    async moveBlock(pageId, blockId, { parentId, position }) {
      const parentNorm = normalizeParentForApi(parentId)
      const pos = String(position)

      // optimistic local
      this.applyMoveLocal(pageId, blockId, {
        newParentId: parentNorm,
        newPosition: pos,
      })

      try {
        await this.patchBlock(String(blockId), { parent_block: parentNorm, position: pos })
        // ✅ no fetch on success
      } catch (e) {
        // fetch hard on error (safe)
        await this.fetchBlocksForPage(pageId)
        throw e
      }
    },

    // Tab indent: optimistic local, fetch hard on error
    async indentBlock(pageId, blockId) {
      blockId = String(blockId)
      const block = this.blocksById[blockId]
      if (!block) return

      this.ensurePageMap(pageId)

      const oldKey = parentKeyOf(block.parentId)
      const siblings = (this.childrenByParentId[pageId][oldKey] ?? []).map(String)
      const idx = siblings.indexOf(blockId)
      if (idx <= 0) return

      const newParentId = siblings[idx - 1]
      const newKey = parentKeyOf(newParentId)
      const newSiblings = (this.childrenByParentId[pageId][newKey] ?? []).map(String)

      const lastId = newSiblings.at(-1) ?? null
      const lastPos = lastId ? this.blocksById[String(lastId)]?.position ?? null : null
      const newPos = posBetween(lastPos, null)

      this.applyMoveLocal(pageId, blockId, { newParentId, newPosition: newPos })

      try {
        await this.patchBlock(blockId, { parent_block: newParentId, position: newPos })
        // ✅ no fetch on success
      } catch (e) {
        await this.fetchBlocksForPage(pageId)
        throw e
      }
    },

    // Shift+Tab outdent: optimistic local, fetch hard on error
    async outdentBlock(pageId, blockId) {
  blockId = String(blockId)
  const block = this.blocksById[blockId]
  if (!block?.parentId) return

  this.ensurePageMap(pageId)

  const oldParentId = String(block.parentId)
  const oldParent = this.blocksById[oldParentId]
  if (!oldParent) return

  const newParentId = oldParent.parentId ?? null
  const oldKey = parentKeyOf(oldParentId)
  const newKey = parentKeyOf(newParentId)

  const siblings = (this.childrenByParentId[pageId][oldKey] ?? []).map(String)
  const idx = siblings.indexOf(blockId)
  if (idx === -1) return

  // fratelli successivi → diventano figli del blocco outdented
  const adoptedChildren = siblings.slice(idx + 1)

  // calcolo nuova posizione: subito dopo il vecchio parent
  const parentSiblings = (this.childrenByParentId[pageId][newKey] ?? []).map(String)
  const parentIdx = parentSiblings.indexOf(oldParentId)

  // se per qualche motivo non troviamo oldParent tra i siblings del newParent, fallback: fine lista
  const prevPos = oldParent.position ?? null
  const nextId = parentIdx >= 0 ? (parentSiblings[parentIdx + 1] ?? null) : null
  const nextPos = nextId ? this.blocksById[String(nextId)]?.position ?? null : null
  const newPos = posBetween(prevPos, nextPos)

  // ---------- OPTIMISTIC LOCAL ----------

  // 1) sposta il blocco (rimuove da oldKey e inserisce in newKey)
  this.applyMoveLocal(pageId, blockId, {
    newParentId,
    newPosition: newPos,
  })

  // 2) IMPORTANT: il vecchio parent mantiene SOLO i fratelli prima del blocco
  //    (non include blockId, altrimenti sembra una "copia")
  this.childrenByParentId[pageId][oldKey] = siblings.slice(0, idx)

  // 3) assegna i fratelli successivi come figli di blockId (appendendo a eventuali figli già esistenti)
  const blockKey = parentKeyOf(blockId)
  const existingChildren = (this.childrenByParentId[pageId][blockKey] ?? []).map(String)
  const nextChildren = existingChildren.concat(adoptedChildren)
  this.childrenByParentId[pageId][blockKey] = nextChildren

  for (const cid of adoptedChildren) {
    const child = this.blocksById[cid]
    if (child) child.parentId = blockId
  }

  // ---------- PERSIST ----------

  try {
    // patch del blocco outdented
    await this.patchBlock(blockId, {
      parent_block: newParentId,
      position: newPos,
    })

    // patch dei figli adottati
    for (const cid of adoptedChildren) {
      await this.patchBlock(cid, { parent_block: blockId })
    }
  } catch (e) {
    await this.fetchBlocksForPage(pageId) // hard resync
    throw e
  }
},

    // Delete: optimistic local remove, fetch hard only on error
    async deleteBlock(blockId, pageId) {
      blockId = String(blockId)

      // optimistic local
      this.applyDeleteLocal(pageId, blockId)

      try {
        await api.delete(`/blocks/${blockId}/`)
        // ✅ no fetch on success
      } catch (error) {
        console.warn('Error deleting block:', error?.response?.data ?? error)
        await this.fetchBlocksForPage(pageId) // hard resync
        throw error
      }
    },

    // -----------------------------
    // Content / type
    // -----------------------------
    async updateBlockContent(blockId, newContent) {
      blockId = String(blockId)
      const editedBlock = this.blocksById[blockId]
      if (!editedBlock) return

      const previousContent = editedBlock.content
      editedBlock.content = newContent

      try {
        await api.patch(`/blocks/${blockId}/`, { content: { text: newContent.text } })
      } catch (error) {
        console.warn('Error updating block:', error?.response?.data ?? error)
        editedBlock.content = previousContent
        throw error
      }
    },

    async updateBlockType(blockId, newType) {
      blockId = String(blockId)
      const editedBlock = this.blocksById[blockId]
      if (!editedBlock) return

      const previousType = editedBlock.type
      editedBlock.type = newType

      try {
        await api.patch(`/blocks/${blockId}/`, { type: newType })
      } catch (error) {
        console.warn('Error updating block:', error?.response?.data ?? error)
        editedBlock.type = previousType
        throw error
      }
    },

    // -----------------------------
    // Add new block (ancora server-driven, ok per Phase A)
    // -----------------------------
    async addNewBlock(pageId, payload, blockId) {
      const key = String(blockId)
      const childIds = this.childrenByParentId[pageId]?.[key] ?? []
      const hasChildren = childIds.length > 0

      if (hasChildren) return await this.addNewBlockAfterAdoptChildren(pageId, payload, blockId)
      return await this.addNewBlockAfter(pageId, payload, blockId)
    },

    async addNewBlockAfter(pageId, payload, blockId) {
      try {
        let postData = {}

        if (!blockId) {
          const parentKey = KEY_ROOT
          const rootIds = this.childrenByParentId[pageId]?.[parentKey] ?? []
          const lastId = rootIds.length ? rootIds[rootIds.length - 1] : null
          const lastPos = lastId ? this.blocksById[String(lastId)]?.position ?? null : null
          const newPos = posBetween(lastPos, null)

          postData = {
            type: payload.type ?? DEFAULT_BLOCK_TYPE,
            content: payload.content ?? { text: '' },
            parent_block: null,
            position: newPos,
          }
        } else {
          const anchor = this.blocksById[String(blockId)]
          if (!anchor) throw new Error('anchor block not found')

          const parentKey = parentKeyOf(anchor.parentId)
          const siblingsIds = this.childrenByParentId[pageId]?.[parentKey] ?? []
          const idx = siblingsIds.map(String).indexOf(String(blockId))
          if (idx === -1) throw new Error(`blockId ${blockId} not found in siblings`)

          const prevPos = this.blocksById[String(blockId)]?.position ?? null
          const nextId = idx + 1 < siblingsIds.length ? siblingsIds[idx + 1] : null
          const nextPos = nextId ? this.blocksById[String(nextId)]?.position ?? null : null
          const newPos = posBetween(prevPos, nextPos)

          postData = {
            type: payload.type ?? DEFAULT_BLOCK_TYPE,
            content: payload.content ?? { text: '' },
            parent_block: anchor.parentId, // null ok
            position: newPos,
          }
        }

        const res = await api.post(`/pages/${pageId}/blocks/`, postData)
        await this.fetchBlocksForPage(pageId)
        return String(res.data.id)
      } catch (error) {
        console.warn('Error adding new block:', error?.response?.data ?? error)
        throw error
      }
    },

    async addNewBlockAfterAdoptChildren(pageId, payload, blockId) {
      const newId = await this.addNewBlockAfter(pageId, payload, blockId)

      const childKey = String(blockId)
      const childIds = this.childrenByParentId[pageId]?.[childKey] ?? []
      if (!childIds.length) return newId

      for (const childId of childIds) {
        await api.patch(`/blocks/${childId}/`, { parent_block: newId })
      }

      await this.fetchBlocksForPage(pageId)
      return newId
    },

    // -----------------------------
    // Cycle check (usata in PageView)
    // -----------------------------
    isCircularMove(draggedId, targetParentId, blocksById) {
      if (!targetParentId || targetParentId === 'root') return false
      if (String(draggedId) === String(targetParentId)) return true

      let currentParentId = String(targetParentId)
      const drag = String(draggedId)

      while (currentParentId) {
        if (currentParentId === drag) return true
        const parentNode = blocksById[currentParentId]
        if (!parentNode) break
        currentParentId = parentNode.parentId != null ? String(parentNode.parentId) : null
      }

      return false
    },

    // -----------------------------
    // LEGACY / probably unused (kept commented)
    // -----------------------------

    /*
    // Old helpers
    setSiblingsOrder(pageId, parentKey, ids) {
      this.childrenByParentId[pageId][parentKey] = ids
    },

    setBlockPosition(pageId, blockId, position) {
      this.blocksById[String(blockId)].position = position
    },

    // Old move APIs (pre-dnd refactor)
    async moveBlockInside(pageId, blockId, newParentId) { ... }

    async moveBlockToParentAtIndex(pageId, blockId, newParentId, insertIndex) { ... }

    // Duplicate cycle checks (you can remove one)
    wouldCreateCycle_Block(dragId, candidateParentId) { ... }

    // Old optimistic move (replaced by applyMoveLocal)
    updateBlockLocationOptimistic(blockId, pageId, { newParentId, newPosition }) { ... }
    */
  },
})
