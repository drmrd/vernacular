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

export interface OpeningResizeEdgeInput {
  edge: OpeningResizeEdge
  draggedJambPosition: number
  width: number
  position: number
  wallLength: number
  minWidth: number
}

/** New width and center after dragging one jamb, clamped to the wall and the minimum width. */
export function openingResizeEdge(input: OpeningResizeEdgeInput): {
  width: number
  position: number
} {
  const halfWidth = input.width / 2
  const draggingStart = input.edge === 'start'
  const fixedJamb = draggingStart ? input.position + halfWidth : input.position - halfWidth
  const wallBound = Math.min(Math.max(input.draggedJambPosition, 0), input.wallLength)
  const draggedJamb = draggingStart
    ? Math.min(wallBound, fixedJamb - input.minWidth)
    : Math.max(wallBound, fixedJamb + input.minWidth)
  return {
    width: Math.abs(draggedJamb - fixedJamb),
    position: (draggedJamb + fixedJamb) / 2,
  }
}

/** Snaps a jamb position to the nearer wall end when within `toleranceMm`, else leaves it. */
export function snapJambToWallEnd(
  jambPosition: number,
  wallLength: number,
  toleranceMm: number,
): number {
  if (Math.abs(jambPosition) <= toleranceMm) {
    return 0
  }
  if (Math.abs(jambPosition - wallLength) <= toleranceMm) {
    return wallLength
  }
  return jambPosition
}
