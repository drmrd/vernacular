import type { Point, RoomSceneNode, SceneGraph, WallSceneNode } from '../../core'
import { contentBounds, type Bounds } from './fit'
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

function indexEntities(scene: SceneGraph): IndexedEntity[] {
  return [
    ...scene.walls.map((wall) => ({ id: wall.id, bounds: wallBounds(wall) })),
    ...scene.rooms.map((room) => ({ id: room.id, bounds: roomBounds(room) })),
  ]
}

/**
 * Broad phase then narrow phase: the spatial index supplies candidate ids near
 * the point, then the nearest in-range wall centerline is resolved among them.
 */
export function hitTest(scene: SceneGraph, point: Point, tolerance: number): string | null {
  const candidateIds = new Set(buildSpatialIndex(indexEntities(scene)).queryPoint(point, tolerance))
  const candidateWalls = scene.walls.filter((wall) => candidateIds.has(wall.id))
  return hitTestWalls(candidateWalls, point, tolerance)
}
