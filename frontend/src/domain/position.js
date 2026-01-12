import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing'

export const KEY_ROOT = 'root'

// Una sola key tra due posizioni (prev/next possono essere null)
export function posBetween(prev, next) {
  return generateKeyBetween(prev ?? null, next ?? null)
}

// Utile quando vuoi creare N blocchi tutti nello stesso punto (es. incolla multiplo)
export function posNBetween(prev, next, n) {
  return generateNKeysBetween(prev ?? null, next ?? null, n)
}
