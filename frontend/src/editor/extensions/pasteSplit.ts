import { Extension } from "@tiptap/core";
import { Plugin } from "prosemirror-state";
import type { Slice } from "prosemirror-model";
import type { EditorState } from "prosemirror-state";

import { useAppActions } from "@/actions/useAppActions";
import { BatchBlockItem } from "@/stores/blocks/types";

export type PasteSplitArgs = {};

export const PasteSplitExtension = Extension.create<{
  onPasteSplit: (args: {
    slice: Slice;
    state: EditorState;
    itemsOverride: BatchBlockItem[];
  }) => void;
}>({
  name: "pasteSplit",

  addProseMirrorPlugins() {
    const actions = useAppActions();
    return [
      new Plugin({
        props: {
          handlePaste: (view, event, slice) => {
            /*//count top-level blocks in slice
            let blockCount = 0;
            slice.content.forEach((n) => {
              if (n.isBlock) blockCount++;
            });

            if (blockCount <= 1) return false;

            event.preventDefault();
            this.options.onPasteSplit({ slice, state: view.state });
            return true;*/
            const html = event.clipboardData?.getData("text/html") ?? "";
            const text = event.clipboardData?.getData("text/plain") ?? "";

            const items = html
              ? actions.editor.clipboardHtmlToBlocks(html, view.state.schema)
              : actions.editor.plainTextToBlocks(text, view.state.schema);
            if (items.length <= 1) return false;

            event.preventDefault();
            this.options.onPasteSplit({
              slice,
              state: view.state,
              itemsOverride: items,
            });
            //actions.editor.pasteSplitFlow({ ... ,  })
            return true;
          },
        },
      }),
    ];
  },
});
