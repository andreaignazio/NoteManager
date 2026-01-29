import usePagesStore from "@/stores/pages";
import { computed, ref, watch } from "vue";
import { useAppActions } from "@/actions/useAppActions";

export function usePageTitleEditor(pageId: { value: string | number | null }) {
  const pagesStore = usePagesStore();
  const actions = useAppActions();

  const titleDraft = ref("");
  const isEditing = ref(false);

  let titleTimer: ReturnType<typeof setTimeout> | null = null;
  let titleOriginal = "";

  function syncFromStore() {
    const id = pageId.value;
    if (!id) return;
    console.log("[PageTitleEditor] syncFromStore", {
      pageId: id,
      title: pagesStore.pagesById[id]?.title ?? "",
    });
    titleDraft.value = pagesStore.pagesById[id]?.title ?? "";
  }

  // quando cambia pagina -> sync sempre
  watch(
    () => pageId.value,
    () => syncFromStore(),
    { immediate: true },
  );

  // quando cambia titolo nello store -> sync solo se NON sto editando
  watch(
    () => {
      const id = pageId.value;
      if (!id) return null;
      return pagesStore.pagesById[id]?.title ?? "";
    },
    () => {
      if (isEditing.value) return;
      const id = pageId.value;
      if (!id) return;
      console.log("[PageTitleEditor] store title changed", {
        pageId: id,
        title: pagesStore.pagesById[id]?.title ?? "",
      });
      syncFromStore();
    },
    { immediate: true },
  );

  const isUntitled = computed(() => {
    const t = (titleDraft.value ?? "").trim();
    return t.length === 0 || t.toLowerCase() === "untitled";
  });

  const titleValueForInput = computed(() => {
    const t = titleDraft.value ?? "";
    return isUntitled.value ? "" : t;
  });

  function onTitleInput(e: Event) {
    const target = e.target as HTMLInputElement | null;
    if (!target) return;
    titleDraft.value = target.value;
    console.log("[PageTitleEditor] onTitleInput", {
      pageId: pageId.value,
      titleDraft: titleDraft.value,
    });
    if (titleTimer) clearTimeout(titleTimer);
    // ✅ salva “live” ma SENZA trim
    titleTimer = setTimeout(() => commitTitle({ trim: false }), 300);
  }

  async function commitTitle({ trim } = { trim: true }) {
    const id = pageId.value;
    if (!id) return;

    const raw = titleDraft.value ?? "";
    const nextTitle = trim ? raw.trim() : raw;

    if ((pagesStore.pagesById[id]?.title ?? "") === nextTitle) return;

    console.log("[PageTitleEditor] commitTitle", {
      pageId: id,
      nextTitle,
      trim,
    });

    try {
      await actions.pages.updatePageMetaWithUndo({
        pageId: id,
        title: nextTitle,
      });
    } catch (e) {
      console.warn("[PageTitleEditor] failed to persist title", e);
      syncFromStore();
    }
  }

  function onTitleFocus() {
    isEditing.value = true;
    titleOriginal = titleDraft.value ?? "";
    console.log("[PageTitleEditor] onTitleFocus", {
      pageId: pageId.value,
      titleOriginal,
    });
  }

  async function onTitleBlur() {
    isEditing.value = false;
    console.log("[PageTitleEditor] onTitleBlur", {
      pageId: pageId.value,
      titleDraft: titleDraft.value,
    });
    if (titleTimer) clearTimeout(titleTimer);
    titleTimer = null;
    // ✅ trim solo quando “finito”
    await commitTitle({ trim: true });
    // opzionale: riallinea da store dopo commit
    syncFromStore();
  }

  async function onTitleKeydown(e: KeyboardEvent) {
    const target = e.currentTarget as HTMLInputElement | null;
    if (e.key === "Enter") {
      e.preventDefault();
      target?.blur();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      titleDraft.value = titleOriginal;
      target?.blur();
    }
  }

  function onTitleMouseDown() {}

  return {
    onTitleInput,
    isUntitled,
    onTitleMouseDown,
    onTitleFocus,
    onTitleBlur,
    onTitleKeydown,
    titleValueForInput,
  };
}
