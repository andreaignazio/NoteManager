export type HoverMenuAction =
  | { type: "openPanel"; panel: "type" | "color" | "font" } // internal
  | { type: "applyBlockType"; blockType: string } // type
  | { type: "setTextColor"; token: string } // color
  | { type: "setBgColor"; token: string } // color
  | { type: "setFont"; fontId: string } // font
  | { type: "custom"; id: string; payload?: any }; // fallback

export type HoverMenuNode =
  | {
      kind: "item";
      id: string;
      label: string;
      iconId?: string;
      icon?: string;
      hint?: string;
      disabled?: boolean;
      danger?: boolean;
      action?: HoverMenuAction;
      children?: HoverMenuNode[]; // opzionale (submenu reali)
    }
  | { kind: "separator"; id: string };
