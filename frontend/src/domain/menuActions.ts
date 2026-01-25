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
