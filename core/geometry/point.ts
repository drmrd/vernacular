import type { Point } from '../model/types'

/** Euclidean distance between two points, in millimeters. */
export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

/** `point` shifted by `delta` (component-wise addition), in millimeters. */
export function translatePoint(point: Point, delta: Point): Point {
  return { x: point.x + delta.x, y: point.y + delta.y }
}

/** `point` rotated about `pivot` by `radians` (positive is counter-clockwise in plan space). */
export function rotatePoint(point: Point, pivot: Point, radians: number): Point {
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const dx = point.x - pivot.x
  const dy = point.y - pivot.y
  return {
    x: pivot.x + (dx * cos - dy * sin),
    y: pivot.y + (dx * sin + dy * cos),
  }
}
