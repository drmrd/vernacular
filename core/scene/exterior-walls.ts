import { pointInPolygon } from '../geometry/polygon'
import { leftNormal } from '../geometry/vector'
import type { Point } from '../model/types'
import {
  WALL_NODE_PREFIX,
  type OpeningSceneNode,
  type RoomSceneNode,
  type WallSceneNode,
} from './scene-graph'

/** A small outward nudge past a wall face, so a sample point clears the face. */
const FACE_SAMPLE_EPS = 1

/** Halves a wall's thickness to reach a face from its centerline. */
const HALF = 2

/**
 * An exterior wall and the plan-space unit direction toward the building's
 * outside. `outwardNormal` points away from the room the wall bounds.
 */
export interface ExteriorWall {
  wallId: string
  outwardNormal: Point
  /** Ids of openings hosted on this wall (its `hostWallId` matches the raw wall id). */
  openingIds: readonly string[]
}

/** A plan-space sample point just past one face of the wall. */
function faceSample(midpoint: Point, normal: Point, distance: number): Point {
  return { x: midpoint.x + normal.x * distance, y: midpoint.y + normal.y * distance }
}

/** True when any room's clear polygon contains `point`. */
function insideAnyRoom(point: Point, rooms: RoomSceneNode[]): boolean {
  return rooms.some((room) => pointInPolygon(point, room.clearPolygon))
}

/**
 * The outward normal of a wall, or null when it is not exterior. A wall is
 * exterior iff exactly one of its two faces sits inside a room; the outward
 * normal points toward the face that is outside.
 */
function outwardNormalOf(wall: WallSceneNode, rooms: RoomSceneNode[]): Point | null {
  const normal = leftNormal(wall.start, wall.end)
  const midpoint = {
    x: (wall.start.x + wall.end.x) / HALF,
    y: (wall.start.y + wall.end.y) / HALF,
  }
  const distance = wall.thickness / HALF + FACE_SAMPLE_EPS
  const plusInside = insideAnyRoom(faceSample(midpoint, normal, distance), rooms)
  const minusInside = insideAnyRoom(faceSample(midpoint, normal, -distance), rooms)
  if (plusInside === minusInside) {
    return null
  }
  return minusInside ? normal : { x: -normal.x, y: -normal.y }
}

/** The raw wall id behind a wall scene-node id, matching an opening's hostWallId. */
function rawWallId(wallNodeId: string): string {
  return wallNodeId.startsWith(WALL_NODE_PREFIX)
    ? wallNodeId.slice(WALL_NODE_PREFIX.length)
    : wallNodeId
}

/**
 * The exterior walls among `walls`, paired with the unit outward normal of
 * each and the ids of openings hosted on the wall. Walls with a room on both
 * faces (interior partitions) or on neither (free-standing) are omitted. Output
 * preserves input order.
 */
export function exteriorWalls(
  walls: WallSceneNode[],
  rooms: RoomSceneNode[],
  openings: OpeningSceneNode[] = [],
): ExteriorWall[] {
  return walls.flatMap((wall) => {
    const outwardNormal = outwardNormalOf(wall, rooms)
    if (outwardNormal === null) {
      return []
    }
    const rawId = rawWallId(wall.id)
    const openingIds = openings
      // An opening with no hostWallId never equals a raw wall id, so it joins no wall.
      .filter((opening) => opening.hostWallId === rawId)
      .map((opening) => opening.id)
    return [{ wallId: wall.id, outwardNormal, openingIds }]
  })
}
