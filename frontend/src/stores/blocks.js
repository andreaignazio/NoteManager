import { defineStore } from 'pinia'
import api from '@/services/api'
import { DEFAULT_BLOCK_TYPE } from '@/domain/blockTypes'
import { posBetween } from '@/domain/position'
import { normalizeProps, isTextToken, isBgToken } from '@/theme/colorsCatalog'
import { DEFAULT_ICON_ID } from '@/icons/catalog'



/*function normalizeProps(rawProps) {
  const p = rawProps && typeof rawProps === 'object' ? rawProps : {}
  const style = p.style && typeof p.style === 'object' ? p.style : {}
  return {
    ...p,
    style: {
      ...DEFAULT_STYLE,
      ...style,
    },
  }
}*/

function normalizeBlock(raw) {
  return {
    id: String(raw.id),
    pageId: String(raw.page),
    parentId: raw.parent_block == null ? null : String(raw.parent_block),
    kind: raw.kind ?? 'block',          
    type: raw.type,
    content: raw.content ?? { text: '' },
    layout: raw.layout ?? {},           
    width: raw.width ?? null,           
    position: raw.position ?? '',
    version: raw.version ?? 1,
    updatedAt: raw.updated_at ?? null,
    props : normalizeProps(raw.props),
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
    getKind(id) {
      const n = this.blocksById[String(id)]
      return n?.kind ?? 'block'
    },
    hasRowAncestor(blockId) {
      let cur = String(blockId)
      while (true) {
        const node = this.blocksById[cur]
        if (!node) return false

        const pid = node.parentId
        if (!pid) return false

        const parent = this.blocksById[String(pid)]
        if (!parent) return false

        if ((parent.kind ?? 'block') === 'row') return true
        cur = String(pid)
      }
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

    applyCreateLocal(pageId, rawNode) {
      const node = {
        id: String(rawNode.id),
        pageId: String(rawNode.pageId ?? pageId),
        parentId: rawNode.parentId == null ? null : String(rawNode.parentId),
        kind: rawNode.kind ?? 'block',
        type: rawNode.type ?? DEFAULT_BLOCK_TYPE,
        content: rawNode.content ?? { text: '' },
        layout: rawNode.layout ?? {},
        width: rawNode.width ?? null,
        position: String(rawNode.position ?? ''),
        version: rawNode.version ?? 1,
        updatedAt: rawNode.updatedAt ?? null,
        props: normalizeProps(rawNode.props),
      }

      this.blocksById[node.id] = node

      // blocksByPage
      if (!this.blocksByPage[pageId]) this.blocksByPage[pageId] = []
      if (!this.blocksByPage[pageId].includes(node.id)) this.blocksByPage[pageId].push(node.id)

      // children map
      this.ensurePageMap(pageId)
      const key = parentKeyOf(node.parentId)
      const arr = (this.childrenByParentId[pageId][key] ?? []).map(String)
      if (!arr.includes(node.id)) arr.push(node.id)
      this.childrenByParentId[pageId][key] = arr
      this.sortSiblingsByPosition(this.childrenByParentId[pageId][key])

      return true
    },

    applyUpdateLocal(blockId, patch) {
      blockId = String(blockId)
      const b = this.blocksById[blockId]
      if (!b) return false

      // non permettere di cambiare id/pageId qui
      const next = { ...b, ...patch }
      next.id = b.id
      next.pageId = b.pageId

      // se cambiano parent/position usa move (regola: update non fa move)
      if ('parentId' in patch || 'position' in patch) {
        console.warn('applyUpdateLocal: parentId/position should use move op')
      }

      this.blocksById[blockId] = next
      return true
    },

    applyTransactionLocal(pageId, tx) {
      if (!tx?.ops?.length) return false
      pageId = String(pageId)

      for (const op of tx.ops) {
        if (!op) continue

        if (op.op === 'create') {
          this.applyCreateLocal(pageId, op.node)
          continue
        }

        if (op.op === 'move') {
          const parentId = op.parentId == null ? null : String(op.parentId)
          this.applyMoveLocal(pageId, op.id, {
            newParentId: parentId,
            newPosition: String(op.position),
          })
          continue
        }

        if (op.op === 'update') {
          this.applyUpdateLocal(op.id, op.patch ?? {})
          continue
        }

        if (op.op === 'delete') {
          this.applyDeleteLocal(pageId, op.id)
          continue
        }

        console.warn('Unknown tx op', op)
      }

      return true
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
    async persistTransaction(pageId, tx) {
      pageId = String(pageId)
      try {
        for (const op of tx.ops ?? []) {
          if (op.op === 'create') {
            // backend: POST /pages/:id/blocks/ (nested action)
            const n = op.node
            const payload = {
              id: n.id,
              kind: n.kind ?? 'block',
              parent_block: n.parentId ?? null,
              position: String(n.position ?? ''),
              type: n.type ?? DEFAULT_BLOCK_TYPE,
              content: n.content ?? { text: '' },
              props: normalizeProps(n.props), 
              layout: n.layout ?? {},
              width: n.width ?? null,
            }
            await api.post(`/pages/${pageId}/blocks/`, payload)
            continue
          }

          if (op.op === 'move') {
            await this.patchBlock(String(op.id), {
              parent_block: op.parentId ?? null,
              position: String(op.position),
            })
            continue
          }

          if (op.op === 'update') {
            await this.patchBlock(String(op.id), op.patch ?? {})
            continue
          }

          if (op.op === 'delete') {
            await api.delete(`/blocks/${String(op.id)}/`)
            continue
          }
        }
      } catch (e) {
        // resync hard
        await this.fetchBlocksForPage(pageId)
        throw e
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
      if (this.hasRowAncestor(blockId)) return
      blockId = String(blockId)
      const block = this.blocksById[blockId]
      if (!block) return

      this.ensurePageMap(pageId)

      const oldKey = parentKeyOf(block.parentId)
      const siblings = (this.childrenByParentId[pageId][oldKey] ?? []).map(String)
      const idx = siblings.indexOf(blockId)
      if (idx <= 0) return

      const newParentId = siblings[idx - 1]
      const prev = this.blocksById[String(newParentId)]
      if (!prev || (prev.kind ?? 'block') !== 'block') return
      if (this.hasRowAncestor(newParentId)) return

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

  
    async outdentBlock(pageId, blockId) {
      if (this.hasRowAncestor(blockId)) return
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

      
      const adoptedChildren = siblings.slice(idx + 1)

      const parentSiblings = (this.childrenByParentId[pageId][newKey] ?? []).map(String)
      const parentIdx = parentSiblings.indexOf(oldParentId)

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
      this.childrenByParentId[pageId][oldKey] = siblings.slice(0, idx)

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
    async updateBlockContent(blockId, patch) {
      blockId = String(blockId)
      const editedBlock = this.blocksById[blockId]
      if (!editedBlock) return

      const previousContent = editedBlock.content
      //editedBlock.content = newContent
       const nextContent = { ...(previousContent ?? {}), ...(patch ?? {}) }

      editedBlock.content = nextContent

      try {
         await api.patch(`/blocks/${blockId}/`, { content: nextContent })
        //await api.patch(`/blocks/${blockId}/`, { content: { text: newContent.text } })
      } catch (error) {
        console.warn('Error updating block:', error?.response?.data ?? error)
        editedBlock.content = previousContent
        throw error
      }
    },

    /*async updateBlockType(blockId, newType) {
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
    },*/
    buildNextProps(existingProps, stylePatch) {
  const base = normalizeProps(existingProps)
  const prevStyle = base.style ?? {}
  const next = {
    ...base,
    style: {
      ...prevStyle,
      ...stylePatch,
    },
  }
  return normalizeProps(next)
},
    async updateBlockType(blockId, newType) {
  blockId = String(blockId)
  const b = this.blocksById[blockId]
  if (!b) return

  const previousType = b.type
  const previousProps = b.props

  // calcola nextProps con la regola richiesta
  let nextProps = previousProps

  const prevStyle = normalizeProps(previousProps).style

  const prevBg = prevStyle?.bgColor ?? 'default'

  // ✅ Regola: se entro in code e bg è ancora default -> set gray_bg
  if (newType === 'code' && prevBg === 'default') {
    nextProps = this.buildNextProps(previousProps, { bgColor: 'gray_bg' })
  }
   if (previousType === 'code' && newType !== 'code' && prevBg === 'gray_bg') {
     nextProps = this.buildNextProps(previousProps, { bgColor: 'default' })
   }

   if (newType === 'callout' && prevBg === 'default') {
    nextProps = this.buildNextProps(previousProps, { bgColor: 'darkgray_bg' })
  }
   if (previousType === 'callout' && newType !== 'callout' && prevBg === 'darkgray_bg') {
     nextProps = this.buildNextProps(previousProps, { bgColor: 'default' })
   }
   if (newType === 'callout' && !b.props?.iconId) {
      nextProps.iconId = DEFAULT_ICON_ID
  }

  // optimistic
  b.type = newType
  if (nextProps !== previousProps) b.props = nextProps

  try {
    // 🔥 1 PATCH sola (meglio): type + props insieme
    const payload = { type: newType }
    if (nextProps !== previousProps) payload.props = nextProps
    await api.patch(`/blocks/${blockId}/`, payload)
  } catch (error) {
    console.warn('Error updating block type:', error?.response?.data ?? error)
    b.type = previousType
    b.props = previousProps
    throw error
  }
},

    async updateBlockStyle(blockId, stylePatch) {
      blockId = String(blockId)
      const b = this.blocksById[blockId]
      if (!b) return

      const prevProps = normalizeProps(b.props)
      const prevStyle = prevProps.style
      const nextStyle = { ...prevStyle }

      if ('textColor' in stylePatch && isTextToken(stylePatch.textColor)) {
        nextStyle.textColor = stylePatch.textColor
      }
      if ('bgColor' in stylePatch && isBgToken(stylePatch.bgColor)) {
        nextStyle.bgColor = stylePatch.bgColor
      }

      const nextProps = { ...prevProps, style: nextStyle }

      b.props = nextProps
      try {
        const res = await api.patch(`/blocks/${blockId}/`, { props: nextProps })
        console.log("PATCH",res)
      } catch (e) {
        b.props = prevProps
        throw e
      }
    },
    async updateBlockIcon(blockId, iconId) {
  const b = this.blocksById[blockId]
  if (!b) return

  const prevProps = b.props ?? {}
  const nextProps = {
    ...prevProps,
    iconId: iconId ?? null,
  }

  b.props = nextProps

  try {
    await api.patch(`/blocks/${blockId}/`, { props: nextProps })
  } catch (e) {
    b.props = prevProps
    throw e
  }
},


    // -----------------------------
    // Add new block 
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
    // LEGACY 
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
