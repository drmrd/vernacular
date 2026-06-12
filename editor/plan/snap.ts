import { distance, type Point, type WallSceneNode } from '../../core'

export type SnapKind =
  | 'endpoint'
  | 'midpoint'
  | 'angle'
  | 'perpendicular'
  | 'parallel'
  | 'grid'
  | 'trace'

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
  tracePoints?: readonly Point[]
  freeAngle?: boolean
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

/** Snap onto the line through `origin` perpendicular to the nearest wall's direction. */
function perpendicularSnap(cursor: Point, context: SnapContext): Candidate | null {
  return directionalSnap(cursor, context, (wallDir) => ({ x: -wallDir.y, y: wallDir.x }))
}

const DEGREES_PER_TURN = 360
const DEGREES_PER_HALF_TURN = 180
const ANGLE_STEP_DEG = 45
const DEG_TO_RAD = Math.PI / DEGREES_PER_HALF_TURN

/** Build the eight unit ray directions at 45-degree intervals off the world axes. */
function buildWorldDirections(): Vector[] {
  const directions: Vector[] = []
  for (let deg = 0; deg < DEGREES_PER_TURN; deg += ANGLE_STEP_DEG) {
    const radians = deg * DEG_TO_RAD
    directions.push({ x: Math.cos(radians), y: Math.sin(radians) })
  }
  return directions
}

/** The eight world-axis directions at 45-degree intervals, computed once at load. */
const WORLD_DIRECTIONS: readonly Vector[] = buildWorldDirections()

/** A candidate angle-lock ray, optionally tagged with the wall it derives from. */
interface DirectedRay {
  direction: Vector
  referenceId?: string
}

/** The world-axis rays, untagged. */
const WORLD_RAYS: readonly DirectedRay[] = WORLD_DIRECTIONS.map((direction) => ({ direction }))

/**
 * Rays every 45 degrees off the nearest wall's direction, tagged with that wall,
 * or [] when no wall gives a usable direction.
 */
function wallRelativeRays(cursor: Point, context: SnapContext): DirectedRay[] {
  const reference = nearestWall(cursor, context.walls)
  if (reference === null) {
    return []
  }
  const wallDir = wallDirection(reference)
  if (wallDir === null) {
    return []
  }
  const baseRadians = Math.atan2(wallDir.y, wallDir.x)
  const rays: DirectedRay[] = []
  for (let step = 0; step < DEGREES_PER_TURN; step += ANGLE_STEP_DEG) {
    const radians = baseRadians + step * DEG_TO_RAD
    rays.push({
      direction: { x: Math.cos(radians), y: Math.sin(radians) },
      referenceId: reference.id,
    })
  }
  return rays
}

/**
 * The candidate ray nearest the offset bearing, by largest dot product, keeping its
 * reference. Maximizing the dot product finds the nearest bearing over the full circle
 * (no atan2 needed) because all signed directions are candidates, so the most
 * forward-aligned ray is the closest in angle. `rays` must be non-empty.
 */
function nearestRay(offset: Vector, rays: readonly DirectedRay[]): DirectedRay {
  let best: DirectedRay | undefined
  let bestDot = -Infinity
  for (const ray of rays) {
    const dot = offset.x * ray.direction.x + offset.y * ray.direction.y
    if (dot > bestDot) {
      best = ray
      bestDot = dot
    }
  }
  if (best === undefined) {
    throw new Error('nearestRay requires at least one candidate ray')
  }
  return best
}

/**
 * Lock the drawn direction to the nearest 45-degree ray, projecting the cursor onto
 * it. Candidates are the world-axis rays and the rays every 45 degrees off the nearest
 * wall's direction, so a run squares up to the world axes or to an angled wall; a
 * wall-relative lock carries that wall's `referenceId`.
 */
function angleSnap(cursor: Point, context: SnapContext): SnapResult | null {
  const origin = context.origin
  if (context.freeAngle || origin === undefined) {
    return null
  }
  const offset = { x: cursor.x - origin.x, y: cursor.y - origin.y }
  if (offset.x === 0 && offset.y === 0) {
    return null
  }
  const ray = nearestRay(offset, [...WORLD_RAYS, ...wallRelativeRays(cursor, context)])
  const along = offset.x * ray.direction.x + offset.y * ray.direction.y
  const point = { x: origin.x + along * ray.direction.x, y: origin.y + along * ray.direction.y }
  return ray.referenceId === undefined
    ? { point, kind: 'angle' }
    : { point, kind: 'angle', referenceId: ray.referenceId }
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

/** The nearest underlay trace point within tolerance, or null when none qualifies. */
function nearestTracePoint(
  cursor: Point,
  points: readonly Point[],
  toleranceMm: number,
): Point | null {
  let best: Point | null = null
  let bestDistance = Infinity
  for (const point of points) {
    const distanceMm = distance(cursor, point)
    if (distanceMm <= toleranceMm && distanceMm < bestDistance) {
      best = point
      bestDistance = distanceMm
    }
  }
  return best
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
  const trace = nearestTracePoint(cursor, context.tracePoints ?? [], context.toleranceMm)
  if (trace !== null) {
    return { point: trace, kind: 'trace' }
  }
  const endpoint = nearestFeature(cursor, context, (wall) => [wall.start, wall.end])
  if (endpoint !== null) {
    return asResult(endpoint, 'endpoint')
  }
  const midpoint = nearestFeature(cursor, context, (wall) => [midpointOf(wall)])
  if (midpoint !== null) {
    return asResult(midpoint, 'midpoint')
  }
  const angle = angleSnap(cursor, context)
  if (angle !== null) {
    return angle
  }
  const perpendicular = perpendicularSnap(cursor, context)
  if (perpendicular !== null) {
    return asResult(perpendicular, 'perpendicular')
  }
  const parallel = parallelSnap(cursor, context)
  if (parallel !== null) {
    return asResult(parallel, 'parallel')
  }
  return gridSnap(cursor, context.gridSpacingMm)
}
