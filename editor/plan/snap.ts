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

interface Vector {
  x: number
  y: number
}

function midpointOf(wall: WallSceneNode): Point {
  return { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 }
}

/** Unit direction of a wall, or null for a zero-length wall whose direction is undefined. */
function wallDirection(wall: WallSceneNode): Vector | null {
  const dx = wall.end.x - wall.start.x
  const dy = wall.end.y - wall.start.y
  const length = Math.hypot(dx, dy)
  if (length === 0) {
    return null
  }
  return { x: dx / length, y: dy / length }
}

/** The wall whose midpoint is nearest the cursor, the reference for directional snaps. */
function nearestWall(cursor: Point, walls: readonly WallSceneNode[]): WallSceneNode | null {
  let best: WallSceneNode | null = null
  let bestDistance = Infinity
  for (const wall of walls) {
    const distanceMm = distance(cursor, midpointOf(wall))
    if (distanceMm < bestDistance) {
      best = wall
      bestDistance = distanceMm
    }
  }
  return best
}

/** Project the cursor onto the line through `origin` with unit direction `dir`. */
function projectOntoLine(cursor: Point, origin: Point, dir: Vector): Point {
  const offsetX = cursor.x - origin.x
  const offsetY = cursor.y - origin.y
  const along = offsetX * dir.x + offsetY * dir.y
  return { x: origin.x + along * dir.x, y: origin.y + along * dir.y }
}

/**
 * Snap onto the line through `context.origin` whose direction `lineDirection`
 * derives from the nearest wall's direction (identity for a parallel snap, a
 * quarter turn for a perpendicular one). Accepted only within tolerance.
 */
function directionalSnap(
  cursor: Point,
  context: SnapContext,
  lineDirection: (wallDir: Vector) => Vector,
): Candidate | null {
  const origin = context.origin
  const reference = nearestWall(cursor, context.walls)
  if (origin === undefined || reference === null) {
    return null
  }
  const wallDir = wallDirection(reference)
  if (wallDir === null) {
    return null
  }
  const point = projectOntoLine(cursor, origin, lineDirection(wallDir))
  const distanceMm = distance(cursor, point)
  if (distanceMm > context.toleranceMm) {
    return null
  }
  return { point, referenceId: reference.id, distanceMm }
}

/** Snap onto the line through `origin` parallel to the nearest wall's direction. */
function parallelSnap(cursor: Point, context: SnapContext): Candidate | null {
  return directionalSnap(cursor, context, (wallDir) => wallDir)
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

/** The nearest grid intersection, or null when grid snapping is disabled. */
function gridSnap(cursor: Point, gridSpacingMm: number): SnapResult | null {
  if (gridSpacingMm <= 0) {
    return null
  }
  const round = (value: number): number => Math.round(value / gridSpacingMm) * gridSpacingMm
  return { point: { x: round(cursor.x), y: round(cursor.y) }, kind: 'grid' }
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
  const parallel = parallelSnap(cursor, context)
  if (parallel !== null) {
    return asResult(parallel, 'parallel')
  }
  return gridSnap(cursor, context.gridSpacingMm)
}
