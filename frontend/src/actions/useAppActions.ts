import { usePageActions } from "./pages.actions";
import { useTextActions } from "./text.actions";
import { useUtilityActions } from "./utility.actions";
import { useBlockActions } from "./blocks.actions";
import { useEditorActions } from "./editor.actions";
import { nextTick } from "vue";
import { useBlocksStore } from "@/stores/blocks";
import usePagesStore from "@/stores/pages";
import router from "@/router";
import { useUiStore } from "@/stores/ui";
// import { useBlockActions } from './blocks.actions'
// import { useOverlayActions } from './overlays.actions'

export function useAppActions() {
  const _blocksStore = useBlocksStore();
  const _pagesStore = usePagesStore();
  const _ui = useUiStore();

  const pages = usePageActions();
  const text = useTextActions();
  const utility = useUtilityActions();
  const blocks = useBlockActions();
  const editor = useEditorActions();
  // const blocks = useBlockActions()
  // const overlays = useOverlayActions()

  async function moveBlockTreeToPageAndFocus(
    blockId: string,
    targetPageId: string,
  ) {
    await blocks.moveBlockTreeToPage(blockId, targetPageId);
    await nextTick();

    pages.redirectToPage(targetPageId);
    await nextTick();
    _ui.setLastAddedPageId(targetPageId);
    _ui.requestScrollToBlock(blockId);
    _blocksStore.requestFocus(blockId, 0);
  }
  return {
    pages,
    text,
    utility,
    blocks,
    editor,
    moveBlockTreeToPageAndFocus /*, overlays*/,
  };
}

export default useAppActions;
