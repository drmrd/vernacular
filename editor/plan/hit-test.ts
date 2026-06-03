import type { Point, WallSceneNode } from '../../core'

/** A click within this many millimeters of a wall centerline selects it. */
export const DEFAULT_HIT_TOLERANCE_MM = 150

function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y)
  }
  const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared
  const clamped = Math.max(0, Math.min(1, t))
  const projX = start.x + clamped * dx
  const projY = start.y + clamped * dy
  return Math.hypot(point.x - projX, point.y - projY)
}

export function hitTestWalls(
  walls: WallSceneNode[],
  point: Point,
  tolerance: number,
): string | null {
  let bestId: string | null = null
  let bestDistance = tolerance
  for (const wall of walls) {
    const distance = distanceToSegment(point, wall.start, wall.end)
    // <= so that on equal distance the later (more recently drawn) wall wins.
    if (distance <= bestDistance) {
      bestDistance = distance
      bestId = wall.id
    }
  }
  return bestId
}
