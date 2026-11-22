import { pointInPolygon } from '../geometry/polygon'
import type { Point } from '../model/types'
import type { Vector3 } from '../scene/vector3'
import type { CellCopy } from './cells-under-walls'
import { cellCenter, findCellsUnderWalls, NO_ROOM } from './cells-under-walls'
import type { DaylightAperture, DaylightField, DaylightRoom } from './daylight-field'
import {
  createDaylightField,
  daylightFieldCellIndex,
  DEFAULT_WINDOW_NET_TRANSMITTANCE,
  OPEN_DOORWAY_NET_TRANSMITTANCE,
  SKY_VISIBILITY_CHANNEL,
} from './daylight-field'
import type { WallRectangle } from './form-factor'
import { horizontalPointToWallRectangle, visibleThroughReveal } from './form-factor'
import type { RoomSurfaces } from './room-average'
import { measureRoomSurfaces } from './room-average'
import type { DaylightInputLocation } from './room-validation'
import { daylightInputError, OUTLINE_TOLERANCE_MM, validateDaylightRooms } from './room-validation'

/** Height of the work plane above the floor, in plan millimetres, where the field is measured. */
export const DAYLIGHT_WORK_PLANE_HEIGHT_MM = 850

/**
 * Elevation of the mean sky direction that a vertical opening faces, in radians. The
 * cosine-weighted mean direction of the quarter of the sky in front of a vertical opening rises at
 * an angle whose tangent is (2/3) / (pi/3) = 2/pi.
 */
const SKY_FACING_ELEVATION = Math.atan(2 / Math.PI)

/**
 * How far to each side of the span the side test probes, in plan millimetres: twice
 * OUTLINE_TOLERANCE_MM. A span that the end point check accepts lies at most that tolerance off
 * the outline, so each probe lands at least the tolerance away from it, one inside the room and
 * one outside. A point on the outline counts as inside, so a probe must never land on it.
 */
const SIDE_PROBE_MM = 2 * OUTLINE_TOLERANCE_MM

/** One cell of a room, with the form factor from its center to each aperture of the room. */
export interface CellView {
  visibilityIndex: number
  factors: readonly number[]
}

/**
 * Where an aperture's light comes from: the sky toward a world direction (unit vector, Y up), or
 * the room it opens to. `openingArea` is the width times the height from sill to head, in plan
 * square millimetres. `netTransmittance` is the share of light that the opening passes.
 */
export type ApertureGeometry =
  | { kind: 'sky'; direction: Vector3; openingArea: number; netTransmittance: number }
  | { kind: 'doorway'; neighbor: number; openingArea: number; netTransmittance: number }

/** What a room keeps between calls: its apertures, its cells, and its surfaces. */
export interface RoomGeometry {
  openToSky: boolean
  apertures: readonly ApertureGeometry[]
  cells: CellView[]
  surfaces: RoomSurfaces
}

/**
 * The measured geometry of one floor: the empty grid, each room's cached form factors, and the
 * cells under the walls that copy a room cell's value.
 */
export interface SolverGeometry {
  grid: DaylightField
  rooms: readonly RoomGeometry[]
  cellsUnderWalls: readonly CellCopy[]
}

/** The cells of each room, and the room of every cell in row-major order, or `NO_ROOM`. */
interface CellAssignment {
  cellsByRoom: CellView[][]
  roomOfCell: Int32Array
}

interface Opening {
  aperture: DaylightAperture
  /** Unit plan vector that points away from the room. */
  outwardNormal: Point
}

function probe(midpoint: Point, normal: Point, side: number): Point {
  return {
    x: midpoint.x + side * normal.x * SIDE_PROBE_MM,
    y: midpoint.y + side * normal.y * SIDE_PROBE_MM,
  }
}

/** The span lies on the outline when exactly one side of it is inside the room. */
function outwardNormal(
  aperture: DaylightAperture,
  outline: readonly Point[],
  location: DaylightInputLocation,
): Point {
  const [start, end] = aperture.span
  const length = Math.hypot(end.x - start.x, end.y - start.y)
  const normal = { x: (end.y - start.y) / length, y: -(end.x - start.x) / length }
  const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
  const aheadInside = pointInPolygon(probe(midpoint, normal, 1), outline)
  const behindInside = pointInPolygon(probe(midpoint, normal, -1), outline)
  if (aheadInside === behindInside) {
    throw daylightInputError(location, 'its span does not lie on the room outline')
  }
  return aheadInside ? { x: -normal.x, y: -normal.y } : normal
}

/** Plan (x, y) maps to world (x, up, -y); the direction rises by the sky-facing elevation. */
function skyDirection(normal: Point): Vector3 {
  const horizontal = Math.cos(SKY_FACING_ELEVATION)
  return {
    x: normal.x * horizontal,
    y: Math.sin(SKY_FACING_ELEVATION),
    z: -normal.y * horizontal,
  }
}

function apertureGeometry(opening: Opening): ApertureGeometry {
  const { aperture } = opening
  const [start, end] = aperture.span
  const width = Math.hypot(end.x - start.x, end.y - start.y)
  const openingArea = width * Math.max(0, aperture.head - aperture.sill)
  if (aperture.opensTo === 'sky') {
    return {
      kind: 'sky',
      direction: skyDirection(opening.outwardNormal),
      openingArea,
      netTransmittance: aperture.netTransmittance ?? DEFAULT_WINDOW_NET_TRANSMITTANCE,
    }
  }
  return {
    kind: 'doorway',
    neighbor: aperture.opensTo.room,
    openingArea,
    netTransmittance: aperture.netTransmittance ?? OPEN_DOORWAY_NET_TRANSMITTANCE,
  }
}

/** Form factor from a work-plane point to the part of an opening that its reveal leaves visible. */
function openingFormFactor(point: Point, opening: Opening): number {
  const { aperture, outwardNormal: normal } = opening
  const [start, end] = aperture.span
  const distance = (start.x - point.x) * normal.x + (start.y - point.y) * normal.y
  if (distance <= 0) return 0
  const tangent = { x: -normal.y, y: normal.x }
  const alongStart = (start.x - point.x) * tangent.x + (start.y - point.y) * tangent.y
  const alongEnd = (end.x - point.x) * tangent.x + (end.y - point.y) * tangent.y
  const rectangle: WallRectangle = {
    x0: Math.min(alongStart, alongEnd),
    x1: Math.max(alongStart, alongEnd),
    z0: aperture.sill - DAYLIGHT_WORK_PLANE_HEIGHT_MM,
    z1: aperture.head - DAYLIGHT_WORK_PLANE_HEIGHT_MM,
  }
  const visible = visibleThroughReveal(rectangle, { distance, depth: aperture.revealDepth })
  return visible === null ? 0 : horizontalPointToWallRectangle(visible, distance)
}

function roomOpenings(room: DaylightRoom, roomIndex: number): Opening[] {
  return room.apertures.map((aperture, apertureIndex) => ({
    aperture,
    outwardNormal: outwardNormal(aperture, room.outline, {
      room: roomIndex,
      aperture: apertureIndex,
    }),
  }))
}

/**
 * Gives every cell to the first room whose outline contains its center (a center on a wall line
 * counts as inside) and measures its form factors there. Cells in no room, and cells of a room
 * open to the sky, get no form factors. Returns the cells of each room, in the order of `rooms`,
 * and the room of every cell; a cell of a room open to the sky still names its room.
 */
function assignCells(
  grid: DaylightField,
  rooms: readonly DaylightRoom[],
  openings: readonly (readonly Opening[])[],
): CellAssignment {
  const cellsByRoom: CellView[][] = rooms.map(() => [])
  const roomOfCell = new Int32Array(grid.columns * grid.rows).fill(NO_ROOM)
  for (let row = 0; row < grid.rows; row++) {
    for (let column = 0; column < grid.columns; column++) {
      const center = cellCenter(grid, column, row)
      const roomIndex = rooms.findIndex((room) => pointInPolygon(center, room.outline))
      roomOfCell[row * grid.columns + column] = roomIndex
      if (roomIndex === NO_ROOM || rooms[roomIndex]?.openToSky === true) continue
      cellsByRoom[roomIndex]?.push({
        visibilityIndex: daylightFieldCellIndex(grid, column, row) + SKY_VISIBILITY_CHANNEL,
        factors: (openings[roomIndex] ?? []).map((opening) => openingFormFactor(center, opening)),
      })
    }
  }
  return { cellsByRoom, roomOfCell }
}

/** The opening area of every doorway that another room lists into each room, by room index. */
function doorwayAreasInto(
  apertures: readonly (readonly ApertureGeometry[])[],
  roomCount: number,
): number[] {
  const areas = new Array<number>(roomCount).fill(0)
  for (const roomApertures of apertures) {
    for (const aperture of roomApertures) {
      if (aperture.kind === 'doorway') {
        areas[aperture.neighbor] = (areas[aperture.neighbor] ?? 0) + aperture.openingArea
      }
    }
  }
  return areas
}

/**
 * Checks the rooms, then measures the form factor from every cell center at the work plane to
 * every aperture of the cell's room, and finds the room cell that each cell under a wall copies.
 * Throws a RangeError that names the room and the aperture for
 * an input that the field cannot use.
 */
export function measureGeometry(rooms: readonly DaylightRoom[]): SolverGeometry {
  validateDaylightRooms(rooms)
  const grid = createDaylightField(rooms)
  const openings = rooms.map(roomOpenings)
  const { cellsByRoom, roomOfCell } = assignCells(grid, rooms, openings)
  const apertures = openings.map((roomOpenings) => roomOpenings.map(apertureGeometry))
  const doorwayAreas = doorwayAreasInto(apertures, rooms.length)
  const measured: RoomGeometry[] = rooms.map((room, index) => ({
    openToSky: room.openToSky === true,
    apertures: apertures[index] ?? [],
    cells: cellsByRoom[index] ?? [],
    surfaces: measureRoomSurfaces(room, doorwayAreas[index] ?? 0),
  }))
  return { grid, rooms: measured, cellsUnderWalls: findCellsUnderWalls(grid, rooms, roomOfCell) }
}
