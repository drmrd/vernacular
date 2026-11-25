import { wallPath } from '../geometry/wall-path'
import { createFloor, createWall } from '../model/factories'
import type { Floor, Opening, Point, Wall } from '../model/types'
import { effectiveWallThickness } from '../scene/construction-profile'
import { counterClockwiseWalls, pt, wall } from '../scene/opening-room-side-test-fixtures'
import { buildWallGraph } from './wall-graph'
import { deriveWallNetwork, type NetworkWall, type WallNetwork } from './wall-network'

const FLOOR_ID = 'g'
const WALL_THICKNESS_MM = 114
const TEE_ARM_MM = 2000
const TEE_STEM_MM = 1500
const TEE_SPAN_MM = 4000
const TWO_ROOM_WIDTH_MM = 8000
const TWO_ROOM_DEPTH_MM = 3000
const TWO_ROOM_PARTITION_X_MM = 4000
const BRICK_SQUARE_SIDE_MM = 5000
const BRICK_PROFILE = 'solid-masonry-brick'
const STUB_X_MM = 2000
const STUB_LENGTH_MM = 1000

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

/** The four walls on the centerline of a 5000 mm square, each of the solid brick profile. */
export function brickSquareWalls(): Wall[] {
  return squareLoopWalls(0, BRICK_SQUARE_SIDE_MM, 'brick').map((wall) => ({
    ...wall,
    constructionProfile: BRICK_PROFILE,
  }))
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

/** The wall network of the walls, as the plan geometry builds it. */
export function networkOf(walls: readonly Wall[]): WallNetwork {
  return deriveWallNetwork(networkWallsOf(walls))
}

/** The graph of today and the resolved thickness of each of its edges, for the walls. */
export function todaysGraphAndThickness(walls: readonly Wall[]) {
  const graph = buildWallGraph(walls)
  const wallsById = new Map(walls.map((wall) => [wall.id, wall]))
  const thicknessByEdge = graph.edges.map((edge) => {
    const wall = wallsById.get(edge.wallId)
    if (wall === undefined) {
      throw new Error(`expected a wall ${edge.wallId}`)
    }
    return effectiveWallThickness(wall)
  })
  return { graph, thicknessByEdge }
}

/** The room walls of 4000 by 3000 and a stub from the south wall into the room, ending free. */
export function stubRoomWalls(): Wall[] {
  return [...counterClockwiseWalls(), wall('stub', pt(STUB_X_MM, 0), pt(STUB_X_MM, STUB_LENGTH_MM))]
}

/** The record of one face of one wall; throws when the network holds none for it. */
export function faceOf(
  network: WallNetwork,
  wallId: string,
  side: 'positive' | 'negative',
): WallNetwork['faces'][number] {
  const face = network.faces.find((record) => record.wallId === wallId && record.side === side)
  if (face === undefined) {
    throw new Error(`expected a ${side} face for wall ${wallId}`)
  }
  return face
}
