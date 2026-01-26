// domain/clipboard/parseClipboardToBlocks.ts
export type ParsedBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "ordered"; items: string[] }
  | { kind: "code"; text: string };

function clean(s: string) {
  return s.replace(/\r\n/g, "\n").replace(/\t/g, "  ").trimEnd();
}

export function parseClipboardToBlocks(args: {
  text?: string;
  html?: string;
}): ParsedBlock[] {
  const raw = clean(args.text ?? "");

  if (!raw) return [];

  // Code fences
  if (raw.includes("```")) {
    const parts: ParsedBlock[] = [];
    const re = /```[\s\S]*?```/g;
    let last = 0;
    for (const m of raw.matchAll(re)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;

      const before = raw.slice(last, start).trim();
      if (before) parts.push(...parseClipboardToBlocks({ text: before }));

      const code = m[0]
        .replace(/^```[^\n]*\n?/, "")
        .replace(/```$/, "")
        .trimEnd();
      parts.push({ kind: "code", text: code });

      last = end;
    }
    const rest = raw.slice(last).trim();
    if (rest) parts.push(...parseClipboardToBlocks({ text: rest }));
    return parts;
  }

  // Split into paragraphs by blank lines
  const paras = raw
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const out: ParsedBlock[] = [];
  for (const p of paras) {
    // Heading
    const h = p.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const level = Math.min(3, h[1].length) as 1 | 2 | 3;
      out.push({ kind: "heading", level, text: h[2].trim() });
      continue;
    }

    // Bullets
    const bulletLines = p.split("\n");
    const allBullets = bulletLines.every((l) => /^[-*]\s+/.test(l));
    if (allBullets) {
      out.push({
        kind: "bullets",
        items: bulletLines.map((l) => l.replace(/^[-*]\s+/, "").trim()),
      });
      continue;
    }

    // Ordered
    const allOrdered = bulletLines.every((l) => /^\d+\.\s+/.test(l));
    if (allOrdered) {
      out.push({
        kind: "ordered",
        items: bulletLines.map((l) => l.replace(/^\d+\.\s+/, "").trim()),
      });
      continue;
    }

    // Default paragraph (keep single newlines as spaces)
    out.push({ kind: "paragraph", text: p.replace(/\n/g, " ").trim() });
  }

  return out;
}
