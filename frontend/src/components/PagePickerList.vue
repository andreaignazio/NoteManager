<script setup>
import { computed, onMounted, ref, watch, nextTick } from "vue";
import { getIconComponent } from "@/icons/catalog";
import usePagesStore from "@/stores/pages";

const props = defineProps({
  // data / context
  currentPageId: { type: [String, Number, null], default: null },

  // search
  enableSearch: { type: Boolean, default: true },
  query: { type: String, default: "" }, // opzionale: controlled
  searchPlaceholder: { type: String, default: "Search pages…" },

  // expand
  expandedIds: { type: [Array, Set, null], default: null }, // opzionale: controlled
  autoExpandCurrentParent: { type: Boolean, default: true },

  // ui
  title: { type: String, default: "" }, // opzionale: header testo
  maxIndentLevel: { type: Number, default: 6 },
  indentPx: { type: Number, default: 14 },
  basePaddingLeft: { type: Number, default: 10 },

  // fetching
  fetchIfEmpty: { type: Boolean, default: true },
  footerAction: { type: Object, default: null },
  maxHeight: { type: Number, default: null },

  disabledIds: { type: [Array, Set, null], default: null }, // NEW
  isDisabled: { type: Function, default: null }, // NEW (opzionale, più flessibile)
  allowRoot: { type: Boolean, default: false }, // NEW (opzionale)
  rootLabel: { type: String, default: "Top level" }, // NEW (opzionale)
  rootIconId: { type: String, default: "lucide:corner-left-up" }, // NEW
});

const emit = defineEmits([
  "select",
  "update:query",
  "update:expanded",
  "footer-select",
]);

const pagesStore = usePagesStore();

const KEY_ROOT = "root";
const keyOf = (parentId) => (parentId == null ? KEY_ROOT : String(parentId));
const childIdsOf = (parentId) =>
  (pagesStore.childrenByParentId?.[keyOf(parentId)] ?? []).map(String);

const currentId = computed(() =>
  props.currentPageId != null ? String(props.currentPageId) : null,
);

const disabledSet = computed(() => {
  if (!props.disabledIds) return null;
  if (props.disabledIds instanceof Set) return props.disabledIds;
  return new Set((props.disabledIds ?? []).map(String));
});

function isDisabledTarget(pageId) {
  const id = String(pageId);

  // 1) regola esterna (prioritaria)
  if (typeof props.isDisabled === "function" && props.isDisabled(id))
    return true;
  if (disabledSet.value?.has(id)) return true;

  // 2) regola interna attuale (current)
  return currentId.value != null && id === currentId.value;
}

const queryTrim = computed(() => (props.query ?? "").trim());
const footerCtx = computed(() => ({
  query: queryTrim.value,
  hasQuery: queryTrim.value.length > 0,
}));

const footerTitle = computed(() => {
  const fa = props.footerAction;
  if (!fa) return "";
  return typeof fa.title === "function" ? fa.title(footerCtx.value) : fa.title;
});

const footerSubtitle = computed(() => {
  const fa = props.footerAction;
  if (!fa?.subtitle) return "";
  return typeof fa.subtitle === "function"
    ? fa.subtitle(footerCtx.value)
    : fa.subtitle;
});

const footerDisabled = computed(() => {
  const fa = props.footerAction;
  if (!fa) return true;
  if (typeof fa.disabled === "function") return !!fa.disabled(footerCtx.value);
  if (typeof fa.disabled === "boolean") return fa.disabled;
  return false;
});

function clickFooter() {
  const fa = props.footerAction;
  if (!fa || footerDisabled.value) return;

  // opzione 1: callback
  if (typeof fa.onSelect === "function") {
    fa.onSelect(footerCtx.value);
    return;
  }

  // opzione 2: evento
  emit("footer-select", footerCtx.value);
}

/**
 * query: controlled/uncontrolled
 */
const qLocal = ref(props.query ?? "");
watch(
  () => props.query,
  (v) => {
    // se è controlled, synca
    if (v != null) qLocal.value = v;
  },
);

function setQuery(v) {
  qLocal.value = v;
  emit("update:query", v);
}

/**
 * expanded: controlled/uncontrolled
 */
const expandedLocal = ref(new Set());

function getExpandedSet() {
  if (props.expandedIds == null) return expandedLocal.value;
  if (props.expandedIds instanceof Set) return props.expandedIds;
  return new Set((props.expandedIds ?? []).map(String));
}

function setExpandedSet(nextSet) {
  if (props.expandedIds == null) {
    expandedLocal.value = nextSet;
  }
  emit("update:expanded", nextSet);
}

function toggleExpanded(id) {
  const k = String(id);
  const cur = getExpandedSet();
  const next = new Set(cur);
  next.has(k) ? next.delete(k) : next.add(k);
  setExpandedSet(next);
}

function buildRowsExpanded() {
  const out = [];
  const exp = getExpandedSet();

  const walk = (parentId, level) => {
    const kids = childIdsOf(parentId);
    for (const id of kids) {
      const p = pagesStore.pagesById?.[String(id)];
      if (!p) continue;

      const hasKids = childIdsOf(id).length > 0;
      const isExp = hasKids ? exp.has(String(id)) : false;

      out.push({
        id: String(id),
        level,
        title: p.title || "Untitled",
        iconId: p.icon || "lucide:file",
        hasKids,
        expanded: isExp,
        disabled: isDisabledTarget(id),
      });

      if (hasKids && isExp) walk(id, level + 1);
    }
  };

  walk(null, 0);
  return out;
}

// search: flat results, indent “best effort” basato sulla catena parent
function buildRowsSearch(query) {
  const ql = query.toLowerCase();
  const out = [];

  const depthOf = (id) => {
    let d = 0;
    let cur = pagesStore.pagesById?.[String(id)];
    const seen = new Set();
    while (cur?.parentId != null) {
      const pid = String(cur.parentId);
      if (seen.has(pid)) break;
      seen.add(pid);
      d++;
      cur = pagesStore.pagesById?.[pid];
    }
    return d;
  };

  for (const [id, p] of Object.entries(pagesStore.pagesById ?? {})) {
    const title = String(p?.title ?? "Untitled");
    if (!title.toLowerCase().includes(ql)) continue;
    out.push({
      id: String(id),
      level: Math.min(depthOf(id), props.maxIndentLevel),
      title,
      iconId: p?.icon || "lucide:file",
      hasKids: false,
      expanded: false,
      disabled: isDisabledTarget(id),
    });
  }

  out.sort((a, b) => a.title.localeCompare(b.title));
  return out;
}

const rows = computed(() => {
  const query = (qLocal.value ?? "").trim();
  if (query) return buildRowsSearch(query);
  return buildRowsExpanded();
});

async function ensurePagesLoaded() {
  if (!props.fetchIfEmpty) return;
  if (Object.keys(pagesStore.pagesById ?? {}).length) return;
  try {
    await pagesStore.fetchPages();
  } catch (_) {}
}

function autoExpandCurrentParent() {
  if (!props.autoExpandCurrentParent) return;
  if (!currentId.value) return;
  const cur = pagesStore.pagesById?.[currentId.value];
  const pid = cur?.parentId;
  if (pid == null) return;

  const exp = getExpandedSet();
  const next = new Set(exp);
  next.add(String(pid));
  setExpandedSet(next);
}

const searchInputRef = ref(null);
function focusSearch() {
  nextTick(() => {
    requestAnimationFrame(() => {
      searchInputRef.value?.focus?.();
    });
  });
}
// API pubblica da chiamare dal parent quando “apri” un popover
defineExpose({
  resetAndPrepare: async (opts) => {
    // NON resettare query se la controlla l'host: lascia stare
    await ensurePagesLoaded();

    // espandi parent della current page (come già fai)
    autoExpandCurrentParent();

    // ✅ NEW: se ti passo revealPageId, espandi tutta la catena parent
    const rid = opts?.revealPageId ? String(opts.revealPageId) : null;
    if (rid) {
      const next = new Set(getExpandedSet());
      let cur = pagesStore.pagesById?.[rid];
      const seen = new Set();
      while (cur?.parentId != null) {
        const pid = String(cur.parentId);
        if (seen.has(pid)) break;
        seen.add(pid);
        next.add(pid);
        cur = pagesStore.pagesById?.[pid];
      }
      setExpandedSet(next);
    }
  },
  searchInputEl: () => searchInputRef.value,
  focusSearch,
});

function select(targetPageId) {
  if (isDisabledTarget(targetPageId)) return;
  emit("select", String(targetPageId));
}
</script>

<template>
  <div
    class="page-picker"
    :style="{ maxHeight: maxHeight ? maxHeight + 'px' : '100%' }"
  >
    <div class="header-sticky">
      <div v-if="title" class="header">{{ title }}</div>

      <div v-if="enableSearch" class="search">
        <input
          ref="searchInputRef"
          class="search-input"
          type="text"
          :value="qLocal"
          @input="setQuery($event.target.value)"
          :placeholder="searchPlaceholder"
        />
      </div>
    </div>
    <button
      v-if="allowRoot"
      class="row"
      type="button"
      :disabled="false"
      :style="{ paddingLeft: `${basePaddingLeft}px` }"
      @click="emit('select', null)"
    >
      <span class="caret-spacer"></span>
      <component :is="getIconComponent(rootIconId)" :size="16" />
      <span class="label">{{ rootLabel }}</span>
    </button>
    <button
      v-for="r in rows"
      :key="r.id"
      class="row"
      type="button"
      :disabled="r.disabled"
      :style="{ paddingLeft: `${basePaddingLeft + r.level * indentPx}px` }"
      @click="select(r.id)"
    >
      <span
        v-if="!qLocal.trim() && r.hasKids"
        class="caret"
        @click.stop="toggleExpanded(r.id)"
        :title="r.expanded ? 'Collapse' : 'Expand'"
      >
        {{ r.expanded ? "▾" : "▸" }}
      </span>
      <span v-else class="caret-spacer"></span>

      <component :is="getIconComponent(r.iconId)" :size="16" />
      <span class="label">{{ r.title }}</span>
    </button>

    <!--<div v-if="rows.length === 0" class="empty">
      No pages
    </div>-->
    <div v-if="footerAction" class="footer">
      <button
        class="row footer-row"
        type="button"
        :disabled="footerDisabled"
        @click="clickFooter"
      >
        <span class="caret-spacer"></span>

        <component
          :is="getIconComponent(footerAction.iconId || 'lucide:globe')"
          :size="16"
        />

        <div class="text">
          <div class="label">{{ footerTitle }}</div>
          <div v-if="footerSubtitle" class="sub">{{ footerSubtitle }}</div>
        </div>
      </button>
    </div>
  </div>
</template>

<style scoped>
.header-sticky {
  position: sticky;
  top: 0;
  background: var(--bg-menu);
  z-index: 1;
  padding-bottom: 4px;
}
.page-picker {
  padding: 0px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--bg-menu);
  height: 110%;
  min-height: 34px;
  overflow-y: auto;
  overflow-x: hidden;
}
.header {
  font-weight: 700;
  font-size: 13px;
  padding: 6px 8px;
  padding-bottom: 12px;
}
.search {
  padding: 0 6px 6px;
}
.search-input {
  width: 100%;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 10px;
  padding: 8px 10px;
  background: transparent;
  color: inherit;
  outline: none;
}
.row {
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
.row:hover {
  background: var(--bg-hover);
  color: var(--text-main);
}
.row:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.caret {
  width: 16px;
  display: inline-flex;
  justify-content: center;
}
.caret-spacer {
  width: 16px;
  display: inline-block;
}
.label {
  font-size: 14px;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/*.empty { padding: 10px 8px; opacity: .6; }*/

/* scrollbar come prima */
.page-picker::-webkit-scrollbar {
  width: 13px;
}
.page-picker::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.18);
  border-radius: 10px;
  border: 3px solid transparent;
  background-clip: content-box;
}
.page-picker::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.26);
}
.footer {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.06); /* o rgba(0,0,0,.08) in base al tema */
  padding-bottom: 0px;
}
.footer-row {
  align-items: flex-start; /* per titolo + sottotitolo */
}

.text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.sub {
  font-size: 12px;
  opacity: 0.6;
  line-height: 1.2;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
