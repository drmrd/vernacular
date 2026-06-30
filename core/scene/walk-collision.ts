import type { Point } from '../model/types'
import { openingKindOfType } from '../registries/opening-kind'
import {
  WALL_NODE_PREFIX,
  type FurnitureSceneNode,
  type OpeningSceneNode,
  type WallSceneNode,
} from './scene-graph'

/**
 * A point in the world horizontal plane (X, Z), in millimeters. Walk collision
 * runs entirely in this plane: the walker stands on the floor at a fixed eye
 * height, so only the horizontal axes can move into a wall.
 */
export interface PlanarPoint {
  x: number
  z: number
}

/** A wall as a collision segment in the world horizontal plane (X, Z). */
export interface WallSegment {
  start: PlanarPoint
  end: PlanarPoint
  /**
   * The wall's full thickness in millimeters. The walker stands off the
   * centerline by `radius + thickness / 2`, so half the thickness widens the
   * standoff to clear the wall face. Optional: a footprint-perimeter segment is
   * the exact solid boundary and omits it, keeping the plain `radius` standoff.
   */
  thickness?: number
}

/** The walls a walker is blocked by and the walker's radius, passed to advanceWalk. */
export interface WalkCollisionWorld {
  segments: readonly WallSegment[]
  radius: number
}

// Below this separation the push-out direction is taken from the wall's own
// normal rather than the (degenerate) vector from the wall to the walker.
const CONTACT_EPSILON_MM = 1e-6

/** The point on a finite segment nearest the given point, clamped to its ends. */
function closestPointOnSegment(point: PlanarPoint, segment: WallSegment): PlanarPoint {
  const spanX = segment.end.x - segment.start.x
  const spanZ = segment.end.z - segment.start.z
  const lengthSquared = spanX * spanX + spanZ * spanZ
  if (lengthSquared === 0) {
    return { x: segment.start.x, z: segment.start.z }
  }
  const projection =
    ((point.x - segment.start.x) * spanX + (point.z - segment.start.z) * spanZ) / lengthSquared
  const clamped = Math.max(0, Math.min(1, projection))
  return { x: segment.start.x + clamped * spanX, z: segment.start.z + clamped * spanZ }
}

/** The wall's unit normal in the horizontal plane, used when the walker is on it. */
function segmentNormal(segment: WallSegment): PlanarPoint {
  const spanX = segment.end.x - segment.start.x
  const spanZ = segment.end.z - segment.start.z
  const length = Math.hypot(spanX, spanZ)
  if (length === 0) {
    return { x: 1, z: 0 }
  }
  return { x: -spanZ / length, z: spanX / length }
}

/**
 * Pushes a single point out of one wall segment. The effective clearance is
 * `radius + thickness / 2`, so the walker clears the wall face rather than its
 * centerline; a segment without `thickness` keeps the plain `radius` standoff.
 * If the point is within that clearance it is moved to exactly the clearance
 * distance along the outward direction; the along-wall component is left
 * untouched, so a glancing move slides instead of stopping. A point already
 * clear of the wall is returned unchanged.
 */
function pushOutOfSegment(point: PlanarPoint, segment: WallSegment, radius: number): PlanarPoint {
  const clearance = radius + (segment.thickness ?? 0) / 2
  const closest = closestPointOnSegment(point, segment)
  const outX = point.x - closest.x
  const outZ = point.z - closest.z
  const distance = Math.hypot(outX, outZ)
  if (distance >= clearance) {
    return point
  }
  const direction =
    distance > CONTACT_EPSILON_MM
      ? { x: outX / distance, z: outZ / distance }
      : segmentNormal(segment)
  return { x: closest.x + direction.x * clearance, z: closest.z + direction.z * clearance }
}

/**
 * Resolves a proposed walker position against every wall segment, modeling the
 * walker as a circle of the given radius (a capsule seen from above). Each
 * penetrating segment pushes the position out to the radius along that wall's
 * normal, which clamps a head-on move and lets an angled move slide along the
 * wall. Segments are resolved in sequence so a later wall corrects a position an
 * earlier wall left inside it.
 */
export function resolveWalkCollision(
  position: PlanarPoint,
  segments: readonly WallSegment[],
  radius: number,
): PlanarPoint {
  let resolved = position
  for (const segment of segments) {
    resolved = pushOutOfSegment(resolved, segment, radius)
  }
  return resolved
}

/**
 * Sweeps a walker from `from` to `to`, resolving collision along the whole path
 * so a large per-frame move can never tunnel through a wall. The straight move
 * is sub-stepped into increments no larger than the walker radius, and each
 * increment is resolved with resolveWalkCollision against the running position,
 * so a wall lying between the two endpoints always stops the walker on the near
 * side at the radius standoff. When the move is already within one radius it
 * reduces to a single resolveWalkCollision(to). Returns the final resolved
 * position; never mutates its inputs.
 */
export function sweepWalkCollision(
  from: PlanarPoint,
  to: PlanarPoint,
  world: WalkCollisionWorld,
): PlanarPoint {
  const { segments, radius } = world
  const spanX = to.x - from.x
  const spanZ = to.z - from.z
  const distance = Math.hypot(spanX, spanZ)
  const steps = radius > 0 ? Math.max(1, Math.ceil(distance / radius)) : 1
  const incrementX = spanX / steps
  const incrementZ = spanZ / steps
  let resolved = from
  for (let step = 1; step <= steps; step += 1) {
    const advanced = { x: resolved.x + incrementX, z: resolved.z + incrementZ }
    resolved = resolveWalkCollision(advanced, segments, radius)
  }
  return resolved
}

/** The wall centerline as a world-plane segment: plan x to X, plan y to Z. */
function wallToSegment(wall: WallSceneNode): WallSegment {
  return {
    start: { x: wall.start.x, z: wall.start.y },
    end: { x: wall.end.x, z: wall.end.y },
    thickness: wall.thickness,
  }
}

/** A range of the parameter t in [0, 1] that walks a segment from start to end. */
interface SpanInterval {
  start: number
  end: number
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value))
}

/** The position of a world point as a parameter t along the segment. */
function wallParam(segment: WallSegment, x: number, z: number): number {
  const spanX = segment.end.x - segment.start.x
  const spanZ = segment.end.z - segment.start.z
  const lengthSquared = spanX * spanX + spanZ * spanZ
  if (lengthSquared === 0) {
    return 0
  }
  return ((x - segment.start.x) * spanX + (z - segment.start.z) * spanZ) / lengthSquared
}

/** The world point at parameter t along the segment. */
function pointAtParam(segment: WallSegment, t: number): PlanarPoint {
  return {
    x: segment.start.x + (segment.end.x - segment.start.x) * t,
    z: segment.start.z + (segment.end.z - segment.start.z) * t,
  }
}

/** The span an opening covers on its host wall, as a t interval along the wall. */
function openingSpan(segment: WallSegment, opening: OpeningSceneNode): SpanInterval {
  const half = opening.width / 2
  const startParam = wallParam(
    segment,
    opening.center.x - opening.along.x * half,
    opening.center.y - opening.along.y * half,
  )
  const endParam = wallParam(
    segment,
    opening.center.x + opening.along.x * half,
    opening.center.y + opening.along.y * half,
  )
  return { start: Math.min(startParam, endParam), end: Math.max(startParam, endParam) }
}

/** The solid stretches of a wall once the given gap spans are cut out of it. */
function solidSubsegments(segment: WallSegment, gaps: readonly SpanInterval[]): WallSegment[] {
  const ordered = [...gaps].sort((first, second) => first.start - second.start)
  const result: WallSegment[] = []
  let cursor = 0
  for (const gap of ordered) {
    const gapStart = clampUnit(gap.start)
    if (gapStart > cursor) {
      result.push({
        ...segment,
        start: pointAtParam(segment, cursor),
        end: pointAtParam(segment, gapStart),
      })
    }
    cursor = Math.max(cursor, clampUnit(gap.end))
  }
  if (cursor < 1) {
    result.push({ ...segment, start: pointAtParam(segment, cursor), end: pointAtParam(segment, 1) })
  }
  return result
}

/** Whether the wall hosts the opening, matching the wall node's prefixed id. */
function hostsOpening(wall: WallSceneNode, opening: OpeningSceneNode): boolean {
  return opening.hostWallId !== undefined && wall.id === `${WALL_NODE_PREFIX}${opening.hostWallId}`
}

function splitWall(
  wall: WallSceneNode,
  openings: readonly OpeningSceneNode[],
  passableOpeningIds: ReadonlySet<string>,
): WallSegment[] {
  const segment = wallToSegment(wall)
  const gaps = openings
    .filter((opening) => passableOpeningIds.has(opening.id) && hostsOpening(wall, opening))
    .map((opening) => openingSpan(segment, opening))
  return gaps.length === 0 ? [segment] : solidSubsegments(segment, gaps)
}

/**
 * Builds the collision segments a walker is blocked by on the active floor. Each
 * wall contributes its centerline. A closed opening (a shut door or any window)
 * leaves its host wall solid so the walker cannot pass through it; only an opening
 * named in `passableOpeningIds` (an open, walkable door) cuts a gap in the wall.
 * {@link passableDoorIds} derives that set from the live open-door state.
 */
export function wallSegmentsForWalk(
  walls: readonly WallSceneNode[],
  openings: readonly OpeningSceneNode[],
  passableOpeningIds: ReadonlySet<string> = new Set(),
): WallSegment[] {
  return walls.flatMap((wall) => splitWall(wall, openings, passableOpeningIds))
}

/**
 * Narrows a set of open opening ids to just the doors. An open door is walkable,
 * so it cuts a gap in its host wall; an open window is not, since you cannot walk
 * through a window. An opening counts as a door when `openingKindOfType` of its
 * type is `'door'`; an unknown or non-opening type is excluded. The result feeds
 * `wallSegmentsForWalk` as its passable set.
 */
export function passableDoorIds(
  openings: readonly OpeningSceneNode[],
  openIds: ReadonlySet<string>,
): Set<string> {
  const passable = new Set<string>()
  for (const opening of openings) {
    if (openIds.has(opening.id) && openingKindOfType(opening.type) === 'door') {
      passable.add(opening.id)
    }
  }
  return passable
}

/** A footprint corner as a world-plane point: plan x to X, plan y to Z. */
function cornerToPlanar(corner: Point): PlanarPoint {
  return { x: corner.x, z: corner.y }
}

/** The four perimeter segments of a footprint, traced as a closed loop. */
function footprintSegments(corners: FurnitureSceneNode['footprintCorners']): WallSegment[] {
  const [first, second, third, fourth] = corners
  return [
    { start: cornerToPlanar(first), end: cornerToPlanar(second) },
    { start: cornerToPlanar(second), end: cornerToPlanar(third) },
    { start: cornerToPlanar(third), end: cornerToPlanar(fourth) },
    { start: cornerToPlanar(fourth), end: cornerToPlanar(first) },
  ]
}

/**
 * Builds the collision segments a walker is blocked by from furniture footprints.
 * Each piece contributes the four perimeter segments of its footprint as a closed
 * loop, so the walker cannot step into a piece of furniture from any side. Plan x
 * maps to world X and plan y to world Z, matching the wall mapping.
 */
export function furnitureSegmentsForWalk(furniture: readonly FurnitureSceneNode[]): WallSegment[] {
  return furniture.flatMap((node) => footprintSegments(node.footprintCorners))
}
