import { distance, type Point, type WallEnd, type WallSceneNode } from '../../core'

/** The endpoint of `wall` within `toleranceMm` of `point`, or null; the nearer wins on a tie. */
export function pickWallEndpoint(
  wall: WallSceneNode,
  point: Point,
  toleranceMm: number,
): WallEnd | null {
  const distanceToStart = distance(point, wall.start)
  const distanceToEnd = distance(point, wall.end)
  if (distanceToStart > toleranceMm && distanceToEnd > toleranceMm) {
    return null
  }
  // The nearer endpoint wins; on an exact tie `start` wins because the
  // comparison is strict, so `end` is chosen only when it is strictly nearer.
  const endIsNearer = distanceToEnd < distanceToStart
  return endIsNearer ? 'end' : 'start'
}
