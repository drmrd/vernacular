import { rotatePoint } from '../geometry/point'
import type { FurnitureFootprint, Point } from './types'

// 180 degrees is one pi radians; name the per-degree scalar so no-magic-numbers stays quiet.
const DEGREES_PER_HALF_TURN = 180
const RADIANS_PER_DEGREE = Math.PI / DEGREES_PER_HALF_TURN
const HALF = 2

/**
 * The four corners of the footprint rectangle centered on `position`, rotated by
 * `rotation` degrees about that center, in plan-space millimeters. The winding is
 * fixed (top-left, top-right, bottom-right, bottom-left before rotation) so the 3D
 * extrusion and the 2D furniture symbol agree.
 */
export function furnitureFootprintCorners(
  position: Point,
  rotation: number,
  footprint: FurnitureFootprint,
): [Point, Point, Point, Point] {
  const halfWidth = footprint.width / HALF
  const halfDepth = footprint.depth / HALF
  const radians = rotation * RADIANS_PER_DEGREE
  const corner = (dx: number, dy: number): Point =>
    rotatePoint({ x: position.x + dx, y: position.y + dy }, position, radians)
  return [
    corner(-halfWidth, -halfDepth),
    corner(halfWidth, -halfDepth),
    corner(halfWidth, halfDepth),
    corner(-halfWidth, halfDepth),
  ]
}
