import { Extension } from "@tiptap/core";
import { Plugin } from "prosemirror-state";
import type { Slice } from "prosemirror-model";
import type { EditorState } from "prosemirror-state";

export type PasteSplitArgs = {};

export const PasteSplitExtension = Extension.create<{
  onPasteSplit: (args: { slice: Slice; state: EditorState }) => void;
}>({
  name: "pasteSplit",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handlePaste: (view, event, slice) => {
            //count top-level blocks in slice
            let blockCount = 0;
            slice.content.forEach((n) => {
              if (n.isBlock) blockCount++;
            });

            if (blockCount <= 1) return false;

            event.preventDefault();
            this.options.onPasteSplit({ slice, state: view.state });
            return true;
          },
        },
      }),
    ];
  },
});
