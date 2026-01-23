import type { HoverMenuAction, HoverMenuNode } from "@/domain/hoverMenu";

type Ctx = {
  blockId?: string;
  pageId?: string;
};

export function useHoverMenuActions(opts: {
  openPanel: (panel: "type" | "color" | "font") => void;

  // hooks semantici (li passi dal controller/host)
  applyBlockType: (ctx: Ctx, blockType: string) => void | Promise<void>;
  setTextColor: (ctx: Ctx, token: string) => void | Promise<void>;
  setBgColor: (ctx: Ctx, token: string) => void | Promise<void>;
  setFont: (ctx: Ctx, fontId: string) => void | Promise<void>;

  custom: (ctx: Ctx, id: string, payload?: any) => void | Promise<void>;
}) {
  const handlers: Record<HoverMenuAction["type"], (a: any, ctx: Ctx) => any> = {
    openPanel: (a, _ctx) => opts.openPanel(a.panel),

    applyBlockType: (a, ctx) => opts.applyBlockType(ctx, a.blockType),
    setTextColor: (a, ctx) => opts.setTextColor(ctx, a.token),
    setBgColor: (a, ctx) => opts.setBgColor(ctx, a.token),
    setFont: (a, ctx) => opts.setFont(ctx, a.fontId),

    custom: (a, ctx) => opts.custom(ctx, a.id, a.payload),
  };

  async function run(node: HoverMenuNode, ctx: Ctx) {
    if (node.kind !== "item") return;
    if (node.disabled) return;

    if (!node.action) return;
    return handlers[node.action.type]?.(node.action as any, ctx);
  }

  return { run };
}
