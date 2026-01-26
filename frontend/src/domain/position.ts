import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

export const KEY_ROOT = "root";

export function posBetween(
  prev: string | null | undefined,
  next: string | null | undefined,
): string {
  return generateKeyBetween(prev ?? null, next ?? null);
}

export function posNBetween(
  prev: string | null | undefined,
  next: string | null | undefined,
  n: number,
): string[] {
  return generateNKeysBetween(prev ?? null, next ?? null, n);
}
