export const FONT_PACK = [
  { id: "default", label: "Default", css: "var(--font-default)" },
  { id: "serif", label: "Serif", css: "var(--font-serif)" },
  { id: "mono", label: "Mono", css: "var(--font-mono)" },
  { id: "soft", label: "Soft", css: "var(--font-soft)" },
] as const;

export type FontToken = (typeof FONT_PACK)[number]["id"];

// utile per UI / loops
export const FONT_TOKENS = FONT_PACK.map(f => f.id) as FontToken[];

// mappa veloce per lookup
const FONT_BY_ID: Record<FontToken, (typeof FONT_PACK)[number]> = Object.fromEntries(
  FONT_PACK.map(f => [f.id, f]),
) as any;

export function isFontToken(v: unknown): v is FontToken {
  return typeof v === "string" && (FONT_BY_ID as any)[v] != null;
}

export function fontCssVar(token: unknown, fallback: FontToken = "default"): string {
  const t: FontToken = isFontToken(token) ? token : fallback;
  return FONT_BY_ID[t].css; // es. "var(--font-serif)"
}

export function fontLabel(token: unknown, fallback: FontToken = "default"): string {
  const t: FontToken = isFontToken(token) ? token : fallback;
  return FONT_BY_ID[t].label;
}

/**
 * Ritorna la font-family completa pronta per style binding.
 * Qui puoi aggiungere fallback “system-ui / monospace” se vuoi.
 */
export function fontCssFamily(token: unknown, fallback: FontToken = "default"): string {
  const cssVar = fontCssVar(token, fallback);

  // Se vuoi fallback diversi per mono:
  const t: FontToken = isFontToken(token) ? token : fallback;
  if (t === "mono") {
    return `${cssVar}, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
  }

  return `${cssVar}, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
}
