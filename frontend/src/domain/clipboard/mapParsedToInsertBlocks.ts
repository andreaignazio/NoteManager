// domain/clipboard/mapParsedToInsertBlocks.ts
import type { ParsedBlock } from "./parseClipboardToBlocks";

export type BlockInsert = {
  type: string; // es: "p" | "h1" | "h2" | "bullets" ...
  text?: string;
  items?: string[];
  props?: Record<string, any>;
};

export function mapParsedToInsertBlocks(parsed: ParsedBlock[]): BlockInsert[] {
  const out: BlockInsert[] = [];

  for (const b of parsed) {
    if (b.kind === "heading") {
      out.push({
        type: b.level === 1 ? "h1" : b.level === 2 ? "h2" : "h3",
        text: b.text,
      });
    } else if (b.kind === "paragraph") {
      out.push({ type: "p", text: b.text });
    } else if (b.kind === "bullets") {
      // MVP: se non avete list block vero, splitta in tanti paragraph con prefix oppure create block list
      out.push({ type: "ul", items: b.items });
    } else if (b.kind === "ordered") {
      out.push({ type: "ol", items: b.items });
    } else if (b.kind === "code") {
      out.push({ type: "code", text: b.text });
    }
  }

  return out;
}
