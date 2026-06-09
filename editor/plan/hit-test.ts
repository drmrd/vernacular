import {
  pointInPolygon,
  type DimensionSceneNode,
  type OpeningSceneNode,
  type Point,
  type RoomSceneNode,
  type SceneGraph,
  type WallSceneNode,
} from '../../core'
import { contentBounds, type Bounds } from './fit'
import { openingCorners } from './opening-geometry'
import { buildSpatialIndex, type IndexedEntity } from './spatial-index'

/** A click within this many millimeters of a wall centerline selects it. */
export const DEFAULT_HIT_TOLERANCE_MM = 150

/** The single non-null result `contentBounds` returns for any non-empty point set. */
function spanOf(points: readonly Point[]): Bounds {
  const bounds = contentBounds(points)
  if (bounds === null) {
    throw new Error('cannot compute bounds of an empty point set')
  }
  return bounds
}

/** Axis-aligned bounds spanning a wall's two endpoints, normalized over direction. */
export function wallBounds(wall: WallSceneNode): Bounds {
  return spanOf([wall.start, wall.end])
}

/** Axis-aligned bounds spanning every vertex of a room polygon. */
export function roomBounds(room: RoomSceneNode): Bounds {
  return spanOf(room.polygon)
}

/** Axis-aligned bounds spanning an opening's footprint corners. */
export function openingBounds(opening: OpeningSceneNode): Bounds {
  return spanOf(openingCorners(opening))
}

/** Axis-aligned bounds spanning a dimension's two endpoints. */
export function dimensionBounds(dimension: DimensionSceneNode): Bounds {
  return spanOf([dimension.start, dimension.end])
}

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

export function hitTestDimensions(
  dimensions: DimensionSceneNode[],
  point: Point,
  tolerance: number,
): string | null {
  let bestId: string | null = null
  let bestDistance = tolerance
  for (const dimension of dimensions) {
    const distance = distanceToSegment(point, dimension.start, dimension.end)
    // <= so that on equal distance the later (more recently drawn) dimension wins.
    if (distance <= bestDistance) {
      bestDistance = distance
      bestId = dimension.id
    }
  }
  return bestId
}

export function hitTestOpenings(
  openings: OpeningSceneNode[],
  point: Point,
  // Narrow containment against the footprint is exact: the footprint is an area,
  // not a thin line, so no tolerance band is needed. `_tolerance` exists only to
  // keep the signature parallel with `hitTestWalls` so `hitTest` can dispatch uniformly.
  _tolerance: number,
): string | null {
  void _tolerance
  let hitId: string | null = null
  for (const opening of openings) {
    // Iterate forward so a later (more recently added) opening wins on overlap.
    if (pointInPolygon(point, openingCorners(opening))) {
      hitId = opening.id
    }
  }
  return hitId
}

function indexEntities(scene: SceneGraph): IndexedEntity[] {
  return [
    ...scene.openings.map((opening) => ({ id: opening.id, bounds: openingBounds(opening) })),
    ...scene.walls.map((wall) => ({ id: wall.id, bounds: wallBounds(wall) })),
    ...scene.dimensions.map((dimension) => ({
      id: dimension.id,
      bounds: dimensionBounds(dimension),
    })),
    ...scene.rooms.map((room) => ({ id: room.id, bounds: roomBounds(room) })),
  ]
}

function containingRoomId(rooms: RoomSceneNode[], point: Point): string | null {
  const hit = rooms.find((room) => pointInPolygon(point, room.polygon))
  return hit ? hit.id : null
}

/**
 * Broad phase then narrow phase: the spatial index supplies candidate ids near
 * the point; the nearest in-range wall centerline wins, and only when no wall is
 * in range does the search fall back to the room whose polygon contains the point.
 */
export function hitTest(scene: SceneGraph, point: Point, tolerance: number): string | null {
  const candidateIds = new Set(buildSpatialIndex(indexEntities(scene)).queryPoint(point, tolerance))
  const candidateOpenings = scene.openings.filter((opening) => candidateIds.has(opening.id))
  const openingHit = hitTestOpenings(candidateOpenings, point, tolerance)
  if (openingHit !== null) {
    return openingHit
  }
  const candidateWalls = scene.walls.filter((wall) => candidateIds.has(wall.id))
  const wallHit = hitTestWalls(candidateWalls, point, tolerance)
  if (wallHit !== null) {
    return wallHit
  }
  const candidateDimensions = scene.dimensions.filter((dimension) => candidateIds.has(dimension.id))
  const dimensionHit = hitTestDimensions(candidateDimensions, point, tolerance)
  if (dimensionHit !== null) {
    return dimensionHit
  }
  const candidateRooms = scene.rooms.filter((room) => candidateIds.has(room.id))
  return containingRoomId(candidateRooms, point)
}
