import { usePageActions } from "./pages.actions";
import { useTextActions } from "./text.actions";
import { useUtilityActions } from "./utility.actions";

import { useEditorActions } from "./editor.actions";
import { useDocActions } from "./doc.actions";
import { nextTick } from "vue";
import usePagesStore from "@/stores/pages";
import router from "@/router";
import { useUiStore } from "@/stores/ui";
// import { useBlockActions } from './blocks.actions'
// import { useOverlayActions } from './overlays.actions'

export function useAppActions() {
  const _pagesStore = usePagesStore();
  const _ui = useUiStore();

  const pages = usePageActions();
  const text = useTextActions();
  const utility = useUtilityActions();

  const editor = useEditorActions();
  const doc = useDocActions();
  // const blocks = useBlockActions()
  // const overlays = useOverlayActions()

  return {
    pages,
    text,
    utility,

    editor,
    doc,
  };
}

export default useAppActions;
