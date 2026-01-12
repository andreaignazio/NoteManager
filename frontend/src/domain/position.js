import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing'

export const KEY_ROOT = 'root'


export function posBetween(prev, next) {
  return generateKeyBetween(prev ?? null, next ?? null)
}

export function posNBetween(prev, next, n) {
  return generateNKeysBetween(prev ?? null, next ?? null, n)
}
