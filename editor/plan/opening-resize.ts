import { distance, type Point, type OpeningSceneNode } from '../../core'

export type OpeningResizeEdge = 'start' | 'end'

/** The jamb of `opening` within `toleranceMm` of `point`, or null; the nearer wins on a tie. */
export function pickOpeningResizeHandle(
  opening: OpeningSceneNode,
  point: Point,
  toleranceMm: number,
): OpeningResizeEdge | null {
  const halfWidth = opening.width / 2
  const startJamb: Point = {
    x: opening.center.x - opening.along.x * halfWidth,
    y: opening.center.y - opening.along.y * halfWidth,
  }
  const endJamb: Point = {
    x: opening.center.x + opening.along.x * halfWidth,
    y: opening.center.y + opening.along.y * halfWidth,
  }
  const distanceToStart = distance(point, startJamb)
  const distanceToEnd = distance(point, endJamb)
  if (distanceToStart > toleranceMm && distanceToEnd > toleranceMm) {
    return null
  }
  // The nearer jamb wins; on an exact tie `start` wins because the
  // comparison is strict, so `end` is chosen only when it is strictly nearer.
  const endIsNearer = distanceToEnd < distanceToStart
  return endIsNearer ? 'end' : 'start'
}
