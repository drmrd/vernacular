import {
  DEFAULT_FURNITURE_FOOTPRINT_MM,
  createFloor,
  createFurnitureInstance,
  createOpening,
  createStair,
  createWall,
  type AssetReference,
  type Floor,
  type FurnitureInstance,
  type Opening,
  type Point,
  type Stair,
  type Wall,
} from '../../core'
import { required } from './required'

/** Every floor of the reference project is the same plain grid of rooms. */
export const ROOM_COLUMNS = 5
export const ROOM_ROWS = 2
export const ROOM_WIDTH_MM = 4000
export const ROOM_DEPTH_MM = 5000
export const FURNITURE_PER_ROOM = 5
/** One opening on each of the first walls of a floor: windows outside, doors inside. */
export const OPENINGS_PER_FLOOR = 11

const FLOOR_TO_FLOOR_MM = 3000
const FURNITURE_SPACING_MM = 700
const STAIR_INSET_MM = 500
const WINDOW_TYPE = 'double-hung-window'
const DOOR_TYPE = 'single-swing-door'

/** No pack asset: every piece renders as its massing box, so nothing is downloaded. */
const MASSING_BOX: AssetReference = { scope: 'project', contentHash: 'reference-massing-box' }

interface GridEdge {
  start: Point
  end: Point
  exterior: boolean
}

function gridPoint(column: number, row: number): Point {
  return { x: column * ROOM_WIDTH_MM, y: row * ROOM_DEPTH_MM }
}

function horizontalEdges(): GridEdge[] {
  const edges: GridEdge[] = []
  for (let row = 0; row <= ROOM_ROWS; row += 1) {
    for (let column = 0; column < ROOM_COLUMNS; column += 1) {
      const exterior = row === 0 || row === ROOM_ROWS
      edges.push({ start: gridPoint(column, row), end: gridPoint(column + 1, row), exterior })
    }
  }
  return edges
}

function verticalEdges(): GridEdge[] {
  const edges: GridEdge[] = []
  for (let column = 0; column <= ROOM_COLUMNS; column += 1) {
    for (let row = 0; row < ROOM_ROWS; row += 1) {
      const exterior = column === 0 || column === ROOM_COLUMNS
      edges.push({ start: gridPoint(column, row), end: gridPoint(column, row + 1), exterior })
    }
  }
  return edges
}

/** One wall per grid edge, so every junction is an end point shared by the walls that meet there. */
const GRID_EDGES: readonly GridEdge[] = [...horizontalEdges(), ...verticalEdges()]

export function referenceFloorId(floorIndex: number): string {
  return `floor-${floorIndex + 1}`
}

function buildWalls(floorId: string): Wall[] {
  return GRID_EDGES.map((edge, index) =>
    createWall({ ...edge.start }, { ...edge.end }, { id: `${floorId}-wall-${index + 1}` }),
  )
}

function buildOpenings(floorId: string, walls: readonly Wall[]): Opening[] {
  return GRID_EDGES.slice(0, OPENINGS_PER_FLOOR).map((edge, index) => {
    const wall = required(walls[index], `wall ${index + 1} of ${floorId}`)
    return createOpening({
      id: `${floorId}-opening-${index + 1}`,
      type: edge.exterior ? WINDOW_TYPE : DOOR_TYPE,
      hostWallId: wall.id,
      position: Math.hypot(edge.end.x - edge.start.x, edge.end.y - edge.start.y) / 2,
    })
  })
}

function roomFurniture(floorId: string, column: number, row: number): FurnitureInstance[] {
  const firstOffset = (ROOM_WIDTH_MM - (FURNITURE_PER_ROOM - 1) * FURNITURE_SPACING_MM) / 2
  const corner = gridPoint(column, row)
  const roomIndex = row * ROOM_COLUMNS + column
  return Array.from({ length: FURNITURE_PER_ROOM }, (_, piece) =>
    createFurnitureInstance({
      id: `${floorId}-furniture-${roomIndex * FURNITURE_PER_ROOM + piece + 1}`,
      assetRef: { ...MASSING_BOX },
      position: {
        x: corner.x + firstOffset + piece * FURNITURE_SPACING_MM,
        y: corner.y + ROOM_DEPTH_MM / 2,
      },
      footprint: { ...DEFAULT_FURNITURE_FOOTPRINT_MM },
    }),
  )
}

function buildFurniture(floorId: string): FurnitureInstance[] {
  const pieces: FurnitureInstance[] = []
  for (let row = 0; row < ROOM_ROWS; row += 1) {
    for (let column = 0; column < ROOM_COLUMNS; column += 1) {
      pieces.push(...roomFurniture(floorId, column, row))
    }
  }
  return pieces
}

export function buildReferenceFloor(floorIndex: number): Floor {
  const id = referenceFloorId(floorIndex)
  const walls = buildWalls(id)
  const floor = createFloor(`Floor ${floorIndex + 1}`, {
    id,
    elevation: floorIndex * FLOOR_TO_FLOOR_MM,
    walls,
  })
  return { ...floor, openings: buildOpenings(id, walls), furniture: buildFurniture(id) }
}

/** A main stair in the first room and a back stair in the last room join each floor to the next. */
export function buildReferenceStairs(floors: readonly Floor[]): Stair[] {
  const backStairCorner = gridPoint(ROOM_COLUMNS - 1, ROOM_ROWS - 1)
  return floors.slice(1).flatMap((upper, index) => {
    const lower = required(floors[index], `floor below ${upper.id}`)
    const connection = { fromFloorId: lower.id, toFloorId: upper.id }
    return [
      createStair({
        id: `stair-main-${index + 1}`,
        position: { x: STAIR_INSET_MM, y: STAIR_INSET_MM },
        connection: { ...connection },
      }),
      createStair({
        id: `stair-back-${index + 1}`,
        position: { x: backStairCorner.x + STAIR_INSET_MM, y: backStairCorner.y + STAIR_INSET_MM },
        connection: { ...connection },
      }),
    ]
  })
}
