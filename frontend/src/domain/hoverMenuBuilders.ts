import type { HoverMenuNode } from "@/domain/hoverMenu";
import { BLOCK_TYPES } from "@/domain/blockTypes"; // path tuo
import {
  TEXT_TOKENS,
  BG_TOKENS,
  labelForTextToken,
  labelForBgToken,
} from "@/theme/colorsCatalog";

export function buildRootMenu(): HoverMenuNode[] {
  return [
    {
      kind: "item",
      id: "submenu:type",
      label: "Block style",
      iconId: "lucide:blocks",
      action: { type: "openPanel", panel: "type" },
    },
    {
      kind: "item",
      id: "submenu:color",
      label: "Color",
      iconId: "lucide:palette",
      action: { type: "openPanel", panel: "color" },
    },
    {
      kind: "item",
      id: "submenu:font",
      label: "Font",
      iconId: "",
      action: { type: "openPanel", panel: "font" },
    },

    { kind: "separator", id: "sep:1" },

    {
      kind: "item",
      id: "move_to",
      label: "Move to…",
      iconId: "lucide:folder-input",
      action: { type: "custom", id: "move_to" },
    },
    {
      kind: "item",
      id: "duplicate",
      label: "Duplicate",
      iconId: "lucide:copy",
      action: { type: "custom", id: "duplicate" },
    },
    {
      kind: "item",
      id: "copy_link",
      label: "Copy link to block",
      iconId: "lucide:link",
      action: { type: "custom", id: "copy_link" },
    },
    {
      kind: "item",
      id: "comment",
      label: "Comment",
      iconId: "lucide:message-circle",
      action: { type: "custom", id: "comment" },
    },

    { kind: "separator", id: "sep:2" },

    {
      kind: "item",
      id: "delete",
      label: "Delete block",
      iconId: "lucide:trash-2",
      danger: true,
      action: { type: "custom", id: "delete" },
    },
  ];
}

export function buildTypePanel(): HoverMenuNode[] {
  return BLOCK_TYPES.map((t) => ({
    kind: "item",
    id: `type:${t.type}`,
    label: t.label,
    iconId: t.iconId,
    icon: t.icon, // fallback
    hint: t.description, // opzionale: se vuoi mostrarla a destra o sotto (vedi nota più giù)
    action: { type: "applyBlockType", blockType: t.type },
  }));
}

// Color: io suggerisco 2 sezioni (Text / Background) con separator
export function buildColorPanel(): HoverMenuNode[] {
  const text: HoverMenuNode[] = TEXT_TOKENS.map((tok) => ({
    kind: "item",
    id: `text:${tok}`,
    label: labelForTextToken(tok),
    iconId: "lucide:minus", // placeholder: poi facciamo un pallino colorato
    action: { type: "setTextColor", token: tok },
  }));

  const bg: HoverMenuNode[] = BG_TOKENS.map((tok) => ({
    kind: "item",
    id: `bg:${tok}`,
    label: labelForBgToken(tok),
    iconId: "lucide:minus", // placeholder: poi pallino bg
    action: { type: "setBgColor", token: tok },
  }));

  return [
    { kind: "item", id: "color:section:text", label: "Text", disabled: true },
    ...text,
    { kind: "separator", id: "sep:color" },
    {
      kind: "item",
      id: "color:section:bg",
      label: "Background",
      disabled: true,
    },
    ...bg,
  ];
}

export function buildFontPanel(
  FONT_PACK: { id: string; label: string }[],
): HoverMenuNode[] {
  return FONT_PACK.map((f) => ({
    kind: "item",
    id: `font:${f.id}`,
    label: f.label,
    action: { type: "setFont", fontId: f.id },
  }));
}
