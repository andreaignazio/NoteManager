// src/domain/menuActions.ts

export type MenuCtx = {
  menuId?: string;
  anchorKey?: string;

  pageId?: string;
  blockId?: string;
};

export const MENU_COMMANDS = {
  // block
  BLOCK_DUPLICATE: "block.duplicate",
  BLOCK_DELETE: "block.delete",
  BLOCK_MOVE_TO_PAGE: "block.moveToPage",
  BLOCK_APPLY_TYPE: "block.applyType",
  BLOCK_SET_TEXT_COLOR: "block.setTextColor",
  BLOCK_SET_BG_COLOR: "block.setBgColor",
  BLOCK_SET_FONT: "block.setFont",

  // page
  PAGE_CREATE_AFTER: "page.createAfter",
  PAGE_DUPLICATE: "page.duplicate",
  PAGE_DELETE: "page.delete",

  // editor
  EDITOR_COPY: "editor.copy",
  EDITOR_PASTE: "editor.paste",
  EDITOR_BOLD: "editor.bold",
  EDITOR_ITALIC: "editor.italic",
  EDITOR_STRIKE: "editor.strike",
  EDITOR_UNDERLINE: "editor.underline",
  EDITOR_OPEN_LINK: "editor.openLink",
  EDITOR_REMOVE_LINK: "editor.removeLink",
  EDITOR_TOGGLE_HIGHLIGHT: "editor.toggleHighlight",
  EDITOR_SET_HIGHLIGHT: "editor.setHighlight",

  // generic
  COPY_TO_CLIPBOARD: "app.copyToClipboard",
} as const;

export type MenuCommand = (typeof MENU_COMMANDS)[keyof typeof MENU_COMMANDS];

export type MenuActionPayload =
  | {
      type: "command";
      ctx: MenuCtx;
      command: MenuCommand | string;
      payload?: any;
    }
  | {
      type: "openMenu";
      ctx: MenuCtx;
      menuId: string;
      anchorKey?: string;
      payload?: any;
    }
  | {
      type: "navigate";
      ctx: MenuCtx;
      to: string;
      payload?: any;
    };
