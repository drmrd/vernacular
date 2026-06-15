import type { Point } from '../model/types'

/** `a - b`, component-wise. */
export function subtract(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y }
}

/** The dot product of `a` and `b`. */
export function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y
}

/** `vector` scaled to unit length. */
export function unit(vector: Point): Point {
  const length = Math.hypot(vector.x, vector.y)
  return { x: vector.x / length, y: vector.y / length }
}

/** The opposite direction of `vector`. */
export function negate(vector: Point): Point {
  return { x: -vector.x, y: -vector.y }
}

/** The left-hand perpendicular of `vector`. */
export function leftPerp(vector: Point): Point {
  return { x: -vector.y, y: vector.x }
}

/** The counter-clockwise angle of a 2-D `direction`. */
export function directionAngle(direction: Point): number {
  return Math.atan2(direction.y, direction.x)
}

/** The unit left-hand normal of the direction `a -> b`. */
export function leftNormal(a: Point, b: Point): Point {
  return leftPerp(unit(subtract(b, a)))
}

/** `point` shifted by `distance` along the unit `direction`. */
export function shift(point: Point, direction: Point, distance: number): Point {
  return { x: point.x + direction.x * distance, y: point.y + direction.y * distance }
}
