// ui/anchors.ts

export type AnchorEntity = 'page' | 'block'
export type AnchorAffordance = 'title' | 'dots' | 'plus' | 'handle' | 'icon'
export type AnchorSurface = 'sidebar' | 'main' | 'topbar' | 'hoverToolbar' | 'pie'
export type AnchorScope =
  | 'tree'
  | 'favorite'
  | 'pageTitle'
  | 'blockRow'
  | 'blockContext'

/**
 * Classe dell’ancora (non univoca)
 * Esempio: page:title:sidebar:tree
 */
export function anchorKind(
  entity: AnchorEntity,
  affordance: AnchorAffordance,
  surface: AnchorSurface,
  scope: AnchorScope,
) {
  return `${entity}:${affordance}:${surface}:${scope}` as const
}

/**
 * Chiave univoca dell’ancora (registry-safe)
 * Esempio: page:title:sidebar:tree#123
 */
export function anchorKey(
  kind: string,
  entityId: string | number,
) {
  return `${kind}#${String(entityId)}`
}

/**
 * Utils (debug / matching)
 */
export function splitAnchorKey(key: string) {
  const [kind, id] = key.split('#')
  return { kind, id }
}
    