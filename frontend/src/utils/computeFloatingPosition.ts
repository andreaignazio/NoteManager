export interface ComputeFloatingPositionParams {
  /** anchor x (viewport coords) */
  x: number
  /** anchor y (viewport coords) */
  y: number

  /** floating box width (px) */
  w: number
  /** floating box height (px) */
  h: number

  /**
   * translate fraction x
   * 0.5 => translateX(-50%)
   */
  tx?: number

  /**
   * translate fraction y
   * 0.5 => translateY(-50%)
   */
  ty?: number

  /** viewport margin (px) */
  margin?: number
}

export interface FloatingPositionResult {
  /** anchor x to be used with transform */
  x: number
  /** anchor y to be used with transform */
  y: number

  /** computed top-left (px) */
  left: number
  top: number
}

/**
 * Calcola una posizione (x,y) “ancora” (anchor point) per un floating element
 * che usa un transform tipo translate(-tx*100%, -ty*100%).
 *
 * Esempi:
 * - Pie menu: translate(-50%, -50%)  => tx=0.5, ty=0.5
 * - Toolbar sopra selezione: translate(-50%, -100%) => tx=0.5, ty=1
 */
export function computeFloatingPosition(
  params: ComputeFloatingPositionParams
): FloatingPositionResult {
  const {
    x,
    y,
    w,
    h,
    tx = 0.5,
    ty = 0.5,
    margin = 8,
  } = params

  const vw = window.innerWidth
  const vh = window.innerHeight

  // Convert anchor -> top-left (per box)
  let left = x - w * tx
  let top = y - h * ty

  // Clamp top-left so box stays in viewport
  const minLeft = margin
  const maxLeft = Math.max(margin, vw - margin - w)

  const minTop = margin
  const maxTop = Math.max(margin, vh - margin - h)

  left = Math.min(Math.max(left, minLeft), maxLeft)
  top = Math.min(Math.max(top, minTop), maxTop)

  // Convert back topLeft -> anchor
  const outX = left + w * tx
  const outY = top + h * ty

  return {
    x: outX,
    y: outY,
    left,
    top,
  }
}
