import type { BatchBlockItem } from "@/stores/blocks/types";
import type { Schema } from "prosemirror-model";
import { DOMParser as PMDOMParser } from "prosemirror-model";
export function clipboardHtmlToBlocks(
  html: string,
  schema: Schema,
): BatchBlockItem {}
