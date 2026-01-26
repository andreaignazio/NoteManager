import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useBlocksStore } from "@/stores/blocks";
import { useAppActions } from "@/actions/useAppActions";

export function useBlockFocus(blockId) {
  const blocksStore = useBlocksStore();
  const actions = useAppActions();
  const { currentBlockId } = storeToRefs(blocksStore);

  const isFocused = computed(
    () => String(currentBlockId.value ?? "") === String(blockId),
  );
  const hasAnyFocus = computed(() => currentBlockId.value != null);

  function onFocus() {
    actions.blocks.setCurrentBlock(blockId);
  }

  function onBlur() {
    // delay minimo per permettere il focus del prossimo editor
    requestAnimationFrame(() => {
      const el = document.activeElement;
      const isAnother =
        el && el instanceof HTMLElement && el?.dataset?.blockEditor === "true";
      if (!isAnother) actions.blocks.clearCurrentBlock();
    });
  }

  return { isFocused, hasAnyFocus, onFocus, onBlur };
}
