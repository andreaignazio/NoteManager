<script setup>
import { computed, nextTick, ref, watch, useAttrs  } from 'vue'
import ActionMenuDB from '@/components/ActionMenuDB.vue'
import PagePickerList from '@/components/PagePickerList.vue'
import { getIconComponent } from '@/icons/catalog'
import usePagesStore from '@/stores/pages'

const props = defineProps({
  // popover basics
  open: { type: Boolean, default: false },
  anchorRect: { type: Object, default: null },
  anchorEl: { type: [Object, null], default: null },
  placement: { type: String, default: 'right-start' },
  minWidth: { type: Number, default: 340 },
  gap: { type: Number, default: 6 },
  sideOffsetX: { type: Number, default: 0 },

  // context
  currentPageId: { type: [String, Number, null], default: null }, // disabilita questa
  title: { type: String, default: 'Move to…' },

  enableSearch: { type: Boolean, default: true },
  autoExpandCurrentParentOnOpen: { type: Boolean, default: true },
})
 
defineOptions({ inheritAttrs: false })
const attrs = useAttrs()

const emit = defineEmits(['close', 'select'])

const pagesStore = usePagesStore()

// local expanded: non tocchiamo expandedById della sidebar
const expanded = ref(new Set())
const q = ref('')

const KEY_ROOT = 'root'
const keyOf = (parentId) => (parentId == null ? KEY_ROOT : String(parentId))
const childIdsOf = (parentId) => (pagesStore.childrenByParentId?.[keyOf(parentId)] ?? []).map(String)

const currentId = computed(() => (props.currentPageId != null ? String(props.currentPageId) : null))

function isDisabledTarget(pageId) {
  return currentId.value != null && String(pageId) === currentId.value
}

function toggleExpanded(id) {
  const k = String(id)
  const next = new Set(expanded.value)
  next.has(k) ? next.delete(k) : next.add(k)
  expanded.value = next
}

function buildRowsExpanded() {
  const out = []
  const walk = (parentId, level) => {
    const kids = childIdsOf(parentId)
    for (const id of kids) {
      const p = pagesStore.pagesById?.[String(id)]
      if (!p) continue

      const hasKids = childIdsOf(id).length > 0
      const isExp = hasKids ? expanded.value.has(String(id)) : false

      out.push({
        id: String(id),
        level,
        title: p.title || 'Untitled',
        iconId: p.icon || 'lucide:file',
        hasKids,
        expanded: isExp,
        disabled: isDisabledTarget(id),
      })

      if (hasKids && isExp) walk(id, level + 1)
    }
  }

  walk(null, 0)
  return out
}

// search: flat results, indent “best effort” basato sulla catena parent
function buildRowsSearch(query) {
  const ql = query.toLowerCase()
  const out = []

  const depthOf = (id) => {
    let d = 0
    let cur = pagesStore.pagesById?.[String(id)]
    const seen = new Set()
    while (cur?.parentId != null) {
      const pid = String(cur.parentId)
      if (seen.has(pid)) break
      seen.add(pid)
      d++
      cur = pagesStore.pagesById?.[pid]
    }
    return d
  }

  for (const [id, p] of Object.entries(pagesStore.pagesById ?? {})) {
    const title = String(p?.title ?? 'Untitled')
    if (!title.toLowerCase().includes(ql)) continue
    out.push({
      id: String(id),
      level: Math.min(depthOf(id), 6),
      title,
      iconId: p?.icon || 'lucide:file',
      hasKids: false,
      expanded: false,
      disabled: isDisabledTarget(id),
    })
  }

  out.sort((a, b) => a.title.localeCompare(b.title))
  return out
}

const rows = computed(() => {
  const query = q.value.trim()
  if (query) return buildRowsSearch(query)
  return buildRowsExpanded()
})

watch(
  () => props.open,
  async (v) => {
    if (!v) return
    q.value = ''

    // se non hai ancora pagine caricate, caricale
    // (safe: se fetchPages fallisce, il menu mostrerà vuoto)
    if (!Object.keys(pagesStore.pagesById ?? {}).length) {
      try { await pagesStore.fetchPages() } catch (_) {}
    }

    // auto-expand parent della pagina corrente
    if (props.autoExpandCurrentParentOnOpen && currentId.value) {
      const cur = pagesStore.pagesById?.[currentId.value]
      const pid = cur?.parentId
      if (pid != null) {
        const next = new Set(expanded.value)
        next.add(String(pid))
        expanded.value = next
      }
    }

    await nextTick()
  }
)

function select(targetPageId) {
  if (isDisabledTarget(targetPageId)) return
  emit('select', String(targetPageId))
  emit('close')
}
</script>

<template>
  <ActionMenuDB
    v-bind="attrs"
    :open="open"
    :anchorRect="anchorRect"
    :anchorEl="anchorEl"
    custom
    :placement="placement"
    :minWidth="minWidth"
    :gap="gap"
    :sideOffsetX="sideOffsetX"
    :maxHPost="360"
    :maxWPost="420"
    :xPre="12" :yPre="12"
    :xPost="16" :yPost="200"
    @close="$emit('close')"
  >
    <PagePickerList
      ref="listRef"
      title="Move to…"
      :currentPageId="currentPageId"
      @select="(id) => { $emit('select', id); $emit('close') }"
    />
  </ActionMenuDB>
</template>

<style scoped>
.move-pop { 
  padding: 6px; 
  display: flex; 
  flex-direction: column; 
  gap: 4px; 
  background: var(--bg-menu);
  max-height: 400px;
  overflow-y: auto;
  overflow-x: hidden;
}
  
.move-header { font-weight: 700; font-size: 13px; padding: 6px 8px; }
.move-search { padding: 0 6px 6px; }
.move-search-input{
  width: 100%;
  border: 1px solid rgba(0,0,0,.12);
  border-radius: 10px;
  padding: 8px 10px;
  background: transparent;
  color: inherit;
  outline: none;
}
.move-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: transparent;
  border-radius: 10px;
  padding: 8px 10px;
  cursor: pointer;
  text-align: left;
  color: var(--text-secondary);
}
.move-row:hover { 
  background: var(--bg-hover); 
  color: var(--text-main);}
.move-row:disabled { opacity: .45; cursor: not-allowed; }
.caret { width: 16px; display: inline-flex; justify-content: center; }
.caret-spacer { width: 16px; display: inline-block; }
.label {
  font-size: 14px;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.empty { padding: 10px 8px; opacity: .6; }
.move-pop::-webkit-scrollbar {width:13px; }
.move-pop::-webkit-scrollbar-thumb {
background:rgba(0,0,0,.18);
border-radius:10px;
border:3px solid transparent;
background-clip: content-box;
}
.move-pop::-webkit-scrollbar-thumb:hover {background:rgba(0,0,0,.26); }
</style>
