import { distance, type Point, type WallSceneNode } from '../../core'

export type SnapKind = 'endpoint' | 'midpoint' | 'perpendicular' | 'parallel' | 'grid'

export interface SnapResult {
  point: Point
  kind: SnapKind
  referenceId?: string
}

export interface SnapContext {
  walls: readonly WallSceneNode[]
  gridSpacingMm: number
  toleranceMm: number
  origin?: Point
}

export const DEFAULT_SNAP_GRID_MM = 100
export const SNAP_PIXEL_TOLERANCE = 12

interface Candidate {
  point: Point
  referenceId: string
  distanceMm: number
}

function midpointOf(wall: WallSceneNode): Point {
  return { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 }
}

/** The nearest in-range point among each wall's feature points, or null when none is within tolerance. */
function nearestFeature(
  cursor: Point,
  context: SnapContext,
  pointsOf: (wall: WallSceneNode) => readonly Point[],
): Candidate | null {
  let best: Candidate | null = null
  for (const wall of context.walls) {
    for (const point of pointsOf(wall)) {
      const distanceMm = distance(cursor, point)
      if (distanceMm <= context.toleranceMm && (best === null || distanceMm < best.distanceMm)) {
        best = { point, referenceId: wall.id, distanceMm }
      }
    }
  }
  return best
}

function asResult(candidate: Candidate, kind: SnapKind): SnapResult {
  return { point: candidate.point, kind, referenceId: candidate.referenceId }
}

export function snapPoint(cursor: Point, context: SnapContext): SnapResult | null {
  const endpoint = nearestFeature(cursor, context, (wall) => [wall.start, wall.end])
  if (endpoint !== null) {
    return asResult(endpoint, 'endpoint')
  }
  const midpoint = nearestFeature(cursor, context, (wall) => [midpointOf(wall)])
  if (midpoint !== null) {
    return asResult(midpoint, 'midpoint')
  }
  return null
}
