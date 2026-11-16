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
  // As z grows without end, (distance / slant) * atan(x / slant) falls to 0 for every x.
  const heightTerm = slant === Infinity ? 0 : (distance / slant) * Math.atan(x / slant)
  return (Math.atan(x / distance) - heightTerm) / FULL_TURN
}

/**
 * Form factor from a point on a horizontal plane to a rectangle on a vertical wall at `distance`.
 * Source: the configuration factor from a differential planar element to a rectangle in a plane
 * perpendicular to the element's plane, as tabulated in J. R. Howell, "A Catalog of Radiation Heat
 * Transfer Configuration Factors", and in Siegel and Howell, "Thermal Radiation Heat Transfer"
 * (specification section 6.8), with the part below the point's height cut off.
 * Hand checks: a wall that fills a quarter-space (x from 0, z from 0, both without end) gives 0.25,
 * and a wall that fills the half-space above the point's plane gives 0.5. A distance that is not a
 * positive finite number, an empty or inverted extent, and an edge that is not a number give 0.
 */
export function horizontalPointToWallRectangle(rectangle: WallRectangle, distance: number): number {
  const { x0, x1, z1 } = rectangle
  const z0 = Math.max(rectangle.z0, 0)
  if (!(Number.isFinite(distance) && distance > 0) || !(x0 < x1) || !(z0 < z1)) {
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
 * the inner face. Returns null when nothing is visible, when the outer face does not lie in front
 * of the point (a distance plus depth that is not positive), or when an input is not a number.
 */
export function visibleThroughReveal(
  rectangle: WallRectangle,
  reveal: Reveal,
): WallRectangle | null {
  const outerDistance = reveal.distance + reveal.depth
  if (!(outerDistance > 0)) return null
  const scale = reveal.distance / outerDistance
  const visible: WallRectangle = {
    x0: Math.max(rectangle.x0, rectangle.x0 * scale),
    x1: Math.min(rectangle.x1, rectangle.x1 * scale),
    z0: Math.max(rectangle.z0, rectangle.z0 * scale),
    z1: Math.min(rectangle.z1, rectangle.z1 * scale),
  }
  return visible.x0 < visible.x1 && visible.z0 < visible.z1 ? visible : null
}
