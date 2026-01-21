/**
 * Calcola una posizione (x,y) “ancora” (anchor point) per un floating element
 * che usa un transform tipo translate(-tx*100%, -ty*100%).
 *
 * Esempi:
 * - Pie menu: translate(-50%, -50%)  => tx=0.5, ty=0.5
 * - Toolbar sopra selezione: translate(-50%, -100%) => tx=0.5, ty=1
 *
 * @param {Object} p
 * @param {number} p.x - anchor x (viewport coords)
 * @param {number} p.y - anchor y (viewport coords)
 * @param {number} p.w - width box (px)
 * @param {number} p.h - height box (px)
 * @param {number} [p.tx=0.5] - translate fraction x
 * @param {number} [p.ty=0.5] - translate fraction y
 * @param {number} [p.margin=8] - viewport margin (px)
 * @returns {{ x:number, y:number, left:number, top:number }}
 */
export function computeFloatingPosition({
  x,
  y,
  w,
  h,
  tx = 0.5,
  ty = 0.5,
  margin = 8,
}) {
  const vw = window.innerWidth
  const vh = window.innerHeight

  // Convert anchor->topLeft (per box)
  let left = x - w * tx
  let top = y - h * ty

  // Clamp top-left so box stays in viewport
  const minLeft = margin
  const maxLeft = Math.max(margin, vw - margin - w)
  const minTop = margin
  const maxTop = Math.max(margin, vh - margin - h)

  left = Math.min(Math.max(left, minLeft), maxLeft)
  top = Math.min(Math.max(top, minTop), maxTop)

  // Convert back topLeft->anchor (so you can keep using left/top = anchor + transform)
  const outX = left + w * tx
  const outY = top + h * ty

  return { x: outX, y: outY, left, top }
}
