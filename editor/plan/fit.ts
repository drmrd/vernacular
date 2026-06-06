import type { Point } from '../../core'

export interface Bounds {
  min: Point
  max: Point
}

export function contentBounds(points: readonly Point[]): Bounds | null {
  const [first, ...rest] = points
  if (first === undefined) {
    return null
  }
  let minX = first.x
  let minY = first.y
  let maxX = first.x
  let maxY = first.y
  for (const point of rest) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } }
}
