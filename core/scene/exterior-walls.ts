import { dot, leftNormal, negate, subtract, unit } from '../geometry/vector'
import type { Point } from '../model/types'
import {
  WALL_NODE_PREFIX,
  type OpeningSceneNode,
  type RoomSceneNode,
  type WallSceneNode,
} from './scene-graph'
import { wallStretches, type WallStretch } from './wall-room-sides'

/**
 * One exterior run of a wall: a stretch (see wallStretches) along which a room lies on exactly one
 * side, with the plan-space unit direction toward the outside of that stretch. A wall can have
 * several runs, and two runs of one wall can point opposite ways. A wall that has rooms on one side
 * along its whole length has one run, from 0 to its length.
 */
export interface ExteriorWall {
  /** The wall's scene-node id (`wall:`-prefixed). Several runs can share it. */
  wallId: string
  /** Where the run starts, in mm along the wall from its start. */
  fromMm: number
  /** Where the run ends, in mm along the wall from its start. */
  toMm: number
  /** The unit normal of the wall that points away from the side with the room. */
  outwardNormal: Point
  /** Ids of the openings hosted on this wall whose center lies on this run. */
  openingIds: readonly string[]
  /**
   * Node ids of furniture standing against this run in plan space, filled in by
   * `withAttachedFurniture`; absent when the caller has not run that pairing.
   */
  furnitureIds?: readonly string[]
}

/** The raw wall id behind a wall scene-node id, matching an opening's hostWallId. */
function rawWallId(wallNodeId: string): string {
  return wallNodeId.startsWith(WALL_NODE_PREFIX)
    ? wallNodeId.slice(WALL_NODE_PREFIX.length)
    : wallNodeId
}

/** The stretches of a wall with a room along exactly one side. */
function exteriorStretches(wall: WallSceneNode, rooms: RoomSceneNode[]): WallStretch[] {
  return wallStretches(wall, rooms).filter(
    (stretch) => stretch.sides === 'positive' || stretch.sides === 'negative',
  )
}

/** The unit normal of the wall that points away from the side of `stretch` with the room. */
function outwardNormalOf(wall: WallSceneNode, stretch: WallStretch): Point {
  const normal = leftNormal(wall.start, wall.end)
  return stretch.sides === 'positive' ? negate(normal) : normal
}

/** The openings hosted on `wall`, each with the distance along the wall of its center. */
function hostedOpenings(
  wall: WallSceneNode,
  openings: OpeningSceneNode[],
): { id: string; alongMm: number }[] {
  const rawId = rawWallId(wall.id)
  const direction = unit(subtract(wall.end, wall.start))
  return (
    openings
      // An opening with no hostWallId never equals a raw wall id, so it joins no wall.
      .filter((opening) => opening.hostWallId === rawId)
      .map((opening) => ({
        id: opening.id,
        alongMm: dot(subtract(opening.center, wall.start), direction),
      }))
  )
}

/**
 * The exterior runs of `walls`: for each wall in input order, each of its stretches from
 * wallStretches(wall, rooms) whose sides are 'positive' or 'negative', in order from the wall's
 * start. `outwardNormal` is the negated leftNormal(start, end) for 'positive' and
 * leftNormal(start, end) for 'negative'. A wall with no such stretch (rooms on both sides, or on
 * neither, all along it) has no run. Only rooms on the wall's own floor count.
 *
 * An opening joins the run of its host wall (its `hostWallId` equals the wall node id without the
 * `wall:` prefix) that holds its center: the first run, from the wall's start, whose closed
 * interval [fromMm, toMm] holds the distance along the wall of the opening's center (the
 * projection of center - start on the wall direction). An opening whose center lies on no run, or
 * that has no hostWallId, joins none.
 */
export function exteriorWalls(
  walls: WallSceneNode[],
  rooms: RoomSceneNode[],
  openings: OpeningSceneNode[] = [],
): ExteriorWall[] {
  return walls.flatMap((wall) => {
    const stretches = exteriorStretches(wall, rooms)
    if (stretches.length === 0) {
      return []
    }
    const hosted = hostedOpenings(wall, openings)
    const claimed = new Set<string>()
    return stretches.map((stretch) => {
      const onRun = hosted.filter(
        (opening) =>
          !claimed.has(opening.id) &&
          opening.alongMm >= stretch.fromMm &&
          opening.alongMm <= stretch.toMm,
      )
      onRun.forEach((opening) => claimed.add(opening.id))
      return {
        wallId: wall.id,
        fromMm: stretch.fromMm,
        toMm: stretch.toMm,
        outwardNormal: outwardNormalOf(wall, stretch),
        openingIds: onRun.map((opening) => opening.id),
      }
    })
  })
}
