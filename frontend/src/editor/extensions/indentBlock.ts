import { Node, mergeAttributes } from "@tiptap/core";

export const IndentBlock = Node.create({
  name: "indentBlock",
  group: "block",
  content: "block+",
  defining: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  parseHTML() {
    return [
      {
        tag: "div.doc-indent",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(
        { class: "doc-indent" },
        this.options.HTMLAttributes,
        HTMLAttributes,
      ),
      0,
    ];
  },
});

export default IndentBlock;
