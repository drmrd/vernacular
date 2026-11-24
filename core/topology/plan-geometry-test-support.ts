import { wallPath } from '../geometry/wall-path'
import { createFloor, createWall } from '../model/factories'
import type { Floor, Opening, Point, Wall } from '../model/types'
import type { NetworkWall } from './wall-network'

const FLOOR_ID = 'g'
const WALL_THICKNESS_MM = 114
const TEE_ARM_MM = 2000
const TEE_STEM_MM = 1500
const TEE_SPAN_MM = 4000
const TWO_ROOM_WIDTH_MM = 8000
const TWO_ROOM_DEPTH_MM = 3000
const TWO_ROOM_PARTITION_X_MM = 4000

function wallOf(id: string, start: Point, end: Point): Wall {
  return createWall(start, end, { id, thickness: WALL_THICKNESS_MM })
}

/** The walls as the network reads them: id, path, drawn thickness, and the profile when present. */
export function networkWallsOf(walls: readonly Wall[]): NetworkWall[] {
  return walls.map((wall) => ({
    id: wall.id,
    path: wallPath(wall),
    thickness: wall.thickness,
    ...(wall.constructionProfile === undefined
      ? {}
      : { constructionProfile: wall.constructionProfile }),
  }))
}

/** A floor with id `'g'` holding the walls and, when given, the openings. */
export function floorOf(walls: readonly Wall[], openings: readonly Opening[] = []): Floor {
  return { ...createFloor('Ground', { id: FLOOR_ID, walls: [...walls] }), openings: [...openings] }
}

/** Three walls that meet in one tee at (2000, 0): a and b along the top, c down from the tee. */
export function teeWalls(): Wall[] {
  return [
    wallOf('a', { x: 0, y: 0 }, { x: TEE_ARM_MM, y: 0 }),
    wallOf('b', { x: TEE_ARM_MM, y: 0 }, { x: TEE_SPAN_MM, y: 0 }),
    wallOf('c', { x: TEE_ARM_MM, y: 0 }, { x: TEE_ARM_MM, y: TEE_STEM_MM }),
  ]
}

/** A long wall with a stub that ends in the middle of it, so the long wall splits at the tee. */
export function splitTeeWalls(): Wall[] {
  return [
    wallOf('long', { x: 0, y: 0 }, { x: TEE_SPAN_MM, y: 0 }),
    wallOf('stub', { x: TEE_ARM_MM, y: 0 }, { x: TEE_ARM_MM, y: TEE_STEM_MM }),
  ]
}

/** The four walls of a square loop from `min` to `max` on both axes, ids `<idPrefix>-<index>`. */
export function squareLoopWalls(min: number, max: number, idPrefix: string): Wall[] {
  const corners: Point[] = [
    { x: min, y: min },
    { x: max, y: min },
    { x: max, y: max },
    { x: min, y: max },
  ]
  return corners.map((corner, index) => {
    const next = corners[(index + 1) % corners.length]
    if (next === undefined) {
      throw new Error('expected a closing corner')
    }
    return createWall(corner, next, { id: `${idPrefix}-${index}`, thickness: WALL_THICKNESS_MM })
  })
}

/** An 8000 by 3000 outline split into two rooms by the wall `shared` at x = 4000. */
export function twoRoomWalls(): Wall[] {
  return [
    wallOf('south', { x: 0, y: 0 }, { x: TWO_ROOM_WIDTH_MM, y: 0 }),
    wallOf('east', { x: TWO_ROOM_WIDTH_MM, y: 0 }, { x: TWO_ROOM_WIDTH_MM, y: TWO_ROOM_DEPTH_MM }),
    wallOf('north', { x: TWO_ROOM_WIDTH_MM, y: TWO_ROOM_DEPTH_MM }, { x: 0, y: TWO_ROOM_DEPTH_MM }),
    wallOf('west', { x: 0, y: TWO_ROOM_DEPTH_MM }, { x: 0, y: 0 }),
    wallOf(
      'shared',
      { x: TWO_ROOM_PARTITION_X_MM, y: 0 },
      { x: TWO_ROOM_PARTITION_X_MM, y: TWO_ROOM_DEPTH_MM },
    ),
  ]
}
