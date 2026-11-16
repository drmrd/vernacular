/**
 * Rectangle on a vertical wall, in millimetres: x along the wall from the foot of the point, z above
 * the height of the point.
 */
export type WallRectangle = { x0: number; x1: number; z0: number; z1: number }

/** How deep a window reveal is, and how far the wall stands from the point, in millimetres. */
export type Reveal = { distance: number; depth: number }

const FULL_TURN = 2 * Math.PI

/** Antiderivative of the form factor kernel; see the closed form in `horizontalPointToWallRectangle`. */
function cornerTerm(x: number, z: number, distance: number): number {
  const slant = Math.hypot(distance, z)
  return (Math.atan(x / distance) - (distance / slant) * Math.atan(x / slant)) / FULL_TURN
}

/**
 * Form factor from a point on a horizontal plane to a rectangle on a vertical wall at `distance`.
 * Source: closed form of the differential area to perpendicular rectangle view factor (spec 6.8),
 * with the part below the point's height cut off.
 */
export function horizontalPointToWallRectangle(rectangle: WallRectangle, distance: number): number {
  const { x0, x1, z1 } = rectangle
  const z0 = Math.max(rectangle.z0, 0)
  if (distance <= 0 || z1 <= z0) {
    return 0
  }
  return (
    cornerTerm(x1, z1, distance) -
    cornerTerm(x0, z1, distance) -
    cornerTerm(x1, z0, distance) +
    cornerTerm(x0, z0, distance)
  )
}

/**
 * The part of an opening that a point sees through the reveal: the outer face scales toward the
 * foot of the point by d / (d + depth) (similar triangles), and the visible part is its overlap with
 * the inner face. Returns null when nothing is visible.
 */
export function visibleThroughReveal(
  rectangle: WallRectangle,
  reveal: Reveal,
): WallRectangle | null {
  const scale = reveal.distance / (reveal.distance + reveal.depth)
  const visible: WallRectangle = {
    x0: Math.max(rectangle.x0, rectangle.x0 * scale),
    x1: Math.min(rectangle.x1, rectangle.x1 * scale),
    z0: Math.max(rectangle.z0, rectangle.z0 * scale),
    z1: Math.min(rectangle.z1, rectangle.z1 * scale),
  }
  return visible.x0 < visible.x1 && visible.z0 < visible.z1 ? visible : null
}
