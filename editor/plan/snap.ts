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

function nearestEndpoint(cursor: Point, context: SnapContext): Candidate | null {
  let best: Candidate | null = null
  for (const wall of context.walls) {
    for (const endpoint of [wall.start, wall.end]) {
      const distanceMm = distance(cursor, endpoint)
      if (distanceMm <= context.toleranceMm && (best === null || distanceMm < best.distanceMm)) {
        best = { point: endpoint, referenceId: wall.id, distanceMm }
      }
    }
  }
  return best
}

export function snapPoint(cursor: Point, context: SnapContext): SnapResult | null {
  const endpoint = nearestEndpoint(cursor, context)
  if (endpoint !== null) {
    return { point: endpoint.point, kind: 'endpoint', referenceId: endpoint.referenceId }
  }
  return null
}
