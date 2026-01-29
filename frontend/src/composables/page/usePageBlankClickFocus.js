import { computed } from "vue";

export function usePageBlankClickFocus(pageId, { getLocalTree }) {
  console.warn("[usePageBlankClickFocus] deprecated (SingleDoc mode)");

  const noop = () => {};
  const lastEmptyRootId = computed(() => null);

  return {
    onPagePointerDown: noop,
    registerRowEl: noop,
    ensureFirstEmptyBlockAndFocus: async () => {},
    lastEmptyRootId,
  };
}

/*
import { useBlocksStore } from "@/stores/blocks";
import { computed, nextTick, watch, unref } from "vue";
import { useOverlayStore } from "@/stores/overlay";
import { useAppActions } from "@/actions/useAppActions";

export function usePageBlankClickFocus(pageId, { getLocalTree }) {
  const blocksStore = useBlocksStore();
  const actions = useAppActions();
  const overlay = useOverlayStore();

  const rowElByBlockId = new Map();
  const localTree = computed(() => getLocalTree());
  const pageKey = computed(() => String(unref(pageId) ?? ""));

  function registerRowEl(blockId, el) {
    if (!blockId) return;
    const id = String(blockId);
    if (el) rowElByBlockId.set(id, el);
    else rowElByBlockId.delete(id);
  }

  // ✅ quando cambio pagina: pulisci refs DOM vecchi
  watch(pageKey, () => rowElByBlockId.clear(), { immediate: true });

  // ✅ quando cambia tree: rimuovi entry non più presenti
  watch(
    localTree,
    (tree) => {
      const alive = new Set(flattenVisible(tree).map((n) => String(n.id)));
      for (const k of rowElByBlockId.keys()) {
        if (!alive.has(k)) rowElByBlockId.delete(k);
      }
    },
    { deep: true },
  );

  function flattenVisible(tree) {
    const out = [];
    const walk = (nodes) => {
      for (const n of nodes ?? []) {
        out.push(n);
        if (n.children?.length) walk(n.children);
      }
    };
    walk(tree);
    return out;
  }

  const flatVisible = computed(() => flattenVisible(localTree.value));

  async function onPagePointerDown(e) {
    if (e.button !== 0) return;
    const pid = pageKey.value;
    if (!pid) return;
    if (overlay.hasAny && overlay.top?.options?.stopPointerOutside !== false)
      return;

    const t = e.target;

    const blockItem = t.closest(".block-item");
    if (blockItem) {
      if (t.closest('[data-block-editor="true"]')) return;
      if (t.closest('button, a, input, textarea, [contenteditable="true"]'))
        return;
      const id = blockItem.dataset.id || blockItem.dataset.blockId;
      if (id) {
        e.preventDefault();
        actions.blocks.requestFocus(String(id), -1);
      }
      return;
    }

    if (t.closest(".page-title-input")) return;
    if (t.closest('button, a, input, textarea, [contenteditable="true"]'))
      return;

    const lastRootRect = getLastRootRect(pid);
    if (lastRootRect && e.clientY >= lastRootRect.bottom - 4) {
      e.preventDefault();
      await focusOrCreateAtEndRoot(pid);
      return;
    }

    const hit = closestVisibleBlockByY(e.clientY);
    if (!hit) {
      e.preventDefault();
      await ensureFirstEmptyBlockAndFocus();
      return;
    }

    if (hit.mode === "nearest") {
      e.preventDefault();
      await nextTick();
      actions.blocks.requestFocus(String(hit.id), -1);
      return;
    }

    if (hit.mode === "below") {
      e.preventDefault();
      await focusOrCreateAtEndRoot(pid);
    }
  }

  function closestVisibleBlockByY(clientY) {
    const nodes = flatVisible.value;
    let best = null;
    let bestD = Infinity;
    let bestBottom = -Infinity;
    let bestIdByBottom = null;

    for (const n of nodes) {
      const id = String(n.id);
      const el = rowElByBlockId.get(id);
      if (!el) continue;

      const r = el.getBoundingClientRect();
      const center = (r.top + r.bottom) / 2;
      const d = Math.abs(clientY - center);

      if (d < bestD) {
        bestD = d;
        best = { id, top: r.top, bottom: r.bottom, center };
      }
      if (r.bottom > bestBottom) {
        bestBottom = r.bottom;
        bestIdByBottom = id;
      }
    }

    if (!best) return null;
    if (clientY > bestBottom)
      return {
        mode: "below",
        lastVisibleId: bestIdByBottom,
        lastVisibleBottom: bestBottom,
      };
    return { mode: "nearest", id: best.id };
  }

  function isEmptyParagraph(block) {
    if (!block) return false;
    if (block.type !== "p") return false;
    const t = block.content?.text ?? "";
    return t.trim().length === 0;
  }

  function getFirstEmptyRootBlockId(pid) {
    const rootIds = blocksStore.childrenByParentId?.[pid]?.root ?? [];
    for (const id of rootIds) {
      const b = blocksStore.blocksById[String(id)];
      if (isEmptyParagraph(b)) return String(id);
    }
    return null;
  }

  async function ensureFirstEmptyBlockAndFocus() {
    const pid = pageKey.value;
    if (!pid) return;

    const emptyId = getFirstEmptyRootBlockId(pid);
    if (emptyId) {
      await nextTick();
      actions.blocks.requestFocus(emptyId, 0);
      return;
    }

    const rootIds = blocksStore.childrenByParentId?.[pid]?.root ?? [];
    const lastId = rootIds.at(-1) ? String(rootIds.at(-1)) : null;

    const newId = await actions.blocks.addNewBlock(
      pid,
      {
        type: "p",
        content: { text: "" },
        parent: null,
      },
      lastId,
    );

    await nextTick();
    if (newId) actions.blocks.requestFocus(String(newId), 0);
  }

  function lastRootId(pid) {
    const roots = (blocksStore.childrenByParentId?.[pid]?.root ?? []).map(
      String,
    );
    return roots.length ? roots[roots.length - 1] : null;
  }

  function getLastRootRect(pid) {
    const lastId = lastRootId(pid);
    if (!lastId) return null;
    const el = rowElByBlockId.get(String(lastId));
    if (!el) return null;
    return el.getBoundingClientRect();
  }

  async function focusOrCreateAtEndRoot(pid) {
    const lastId = lastRootId(pid);
    if (lastId) {
      const last = blocksStore.blocksById[String(lastId)];
      if (isEmptyParagraph(last)) {
        await nextTick();
        actions.blocks.requestFocus(String(lastId), -1);
        return;
      }
    }

    const newId = await actions.blocks.addNewBlock(
      pid,
      {
        type: "p",
        content: { text: "" },
        parent: null,
      },
      lastId ? String(lastId) : null,
    );

    await nextTick();
    if (newId) actions.blocks.requestFocus(String(newId), -1);
  }

  const lastEmptyRootId = computed(() => {
    const pid = pageKey.value;
    const rootIds = blocksStore.childrenByParentId?.[pid]?.root ?? [];
    for (let i = rootIds.length - 1; i >= 0; i--) {
      const id = String(rootIds[i]);
      const b = blocksStore.blocksById[id];
      if (!b) continue;
      const t = (b.content?.text ?? "").trim();
      if (t.length === 0) return id;
    }
    return null;
  });

  return {
    onPagePointerDown,
    registerRowEl,
    ensureFirstEmptyBlockAndFocus,
    lastEmptyRootId,
  };
}*/
