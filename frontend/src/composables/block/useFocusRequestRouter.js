import { watch, nextTick } from "vue";
import { storeToRefs } from "pinia";
import { useBlocksStore } from "@/stores/blocks";
import { useAppActions } from "@/actions/useAppActions";

export function useFocusRequestRouter(opts) {
  const blocksStore = useBlocksStore();
  const actions = useAppActions();
  const { focusRequestId } = storeToRefs(blocksStore);

  const {
    getBlockId,
    getIsCode,
    getTiptapEditor, // () => editor.value
    getCodeEditorRef, // () => codeEditorRef.value
    getFallbackTextRef, // () => textEditorRef.value (callout/gutter legacy)
  } = opts;

  watch(
    focusRequestId,
    async (req) => {
      const blockId = getBlockId?.();
      if (!req || String(req.blockId) !== String(blockId)) return;

      await nextTick();

      const caret = req.caret;
      const isCode = !!getIsCode?.();

      if (isCode) {
        const cm = getCodeEditorRef?.();
        cm?.focus?.();
        if (caret === -1) cm?.setCursorEnd?.();
        else if (typeof caret === "number") cm?.setCursor?.(caret);
      } else {
        const ed = getTiptapEditor?.();
        if (ed) {
          if (caret === -1) {
            ed.commands.focus("end");
          } else if (typeof caret === "number") {
            const safePos = Math.max(1, caret);
            ed.commands.focus();
            ed.commands.setTextSelection(safePos);
          } else {
            ed.commands.focus();
          }
        } else {
          const fallback = getFallbackTextRef?.();
          fallback?.focus?.();
          if (typeof caret === "number") fallback?.setCaret?.(caret);
        }
      }

      actions.blocks.clearFocusRequest();
    },
    { flush: "post" },
  );
}
