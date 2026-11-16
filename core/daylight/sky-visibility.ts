import { pointInPolygon } from '../geometry/polygon'
import type { Point } from '../model/types'
import type { Vector3 } from '../scene/vector3'
import type { DaylightAperture, DaylightField, DaylightRoom } from './daylight-field'
import {
  createDaylightField,
  daylightFieldCellIndex,
  OPEN_SKY_VISIBILITY,
  SKY_VISIBILITY_CHANNEL,
} from './daylight-field'
import type { WallRectangle } from './form-factor'
import { horizontalPointToWallRectangle, visibleThroughReveal } from './form-factor'

/**
 * Relative radiance of the sky toward a world direction (unit vector, Y up); 1 is the mean of the
 * open sky, so a brighter part of the dome lets more light through a window that faces it.
 */
export type SkyLuminance = (direction: Vector3) => number

/** A sky of the same radiance in every direction: each window passes its bare form factor. */
export const UNIFORM_SKY: SkyLuminance = () => 1

/** Height of the work plane above the floor, in plan millimetres, where the field is measured. */
export const DAYLIGHT_WORK_PLANE_HEIGHT_MM = 850

/** Share of light that an unpainted surface reflects: the luminance of the wall color #d8d4cc. */
export const UNPAINTED_SURFACE_REFLECTANCE = 0.66

/** Computes the sky visibility of the rooms of one floor for any sky, from geometry it measures once. */
export interface DaylightFieldSolver {
  /** The field for this sky; each cell holds the share of open-sky light it receives. */
  field(sky: SkyLuminance): DaylightField
  /**
   * Light that enters the room through its apertures, in plan square millimetres of open sky.
   * Returns 0 until the room-average term is built.
   */
  enteringFlux(room: number, sky: SkyLuminance): number
  /**
   * Share of open-sky light that reaches every point of the room after bouncing between surfaces.
   * Returns 0 until the room-average term is built.
   */
  interreflection(room: number, sky: SkyLuminance): number
  /** How many times the solver has measured the window-to-cell form factors. */
  readonly geometryPasses: number
}

/**
 * Elevation of the mean sky direction that a vertical opening faces, in radians. The
 * cosine-weighted mean direction of the quarter of the sky in front of a vertical opening rises at
 * an angle whose tangent is (2/3) / (pi/3) = 2/pi.
 */
const SKY_FACING_ELEVATION = Math.atan(2 / Math.PI)

/** How far past the span the outward side test probes, in plan millimetres. */
const OUTWARD_PROBE_MM = 1

/** A cell center sits half a cell past its lower edge. */
const CELL_CENTER_OFFSET = 0.5

/** One cell of a room, with the form factor from its center to each sky aperture of the room. */
interface CellView {
  visibilityIndex: number
  factors: readonly number[]
}

/** What a room keeps between calls: its cells and the direction each sky aperture faces. */
interface RoomGeometry {
  openToSky: boolean
  skyDirections: readonly Vector3[]
  cells: CellView[]
}

interface SolverGeometry {
  grid: DaylightField
  rooms: readonly RoomGeometry[]
}

interface SkyOpening {
  aperture: DaylightAperture
  /** Unit plan vector that points away from the room. */
  outwardNormal: Point
}

function outwardNormal(aperture: DaylightAperture, outline: readonly Point[]): Point {
  const [start, end] = aperture.span
  const length = Math.hypot(end.x - start.x, end.y - start.y)
  const normal = { x: (end.y - start.y) / length, y: -(end.x - start.x) / length }
  const probe = {
    x: (start.x + end.x) / 2 + normal.x * OUTWARD_PROBE_MM,
    y: (start.y + end.y) / 2 + normal.y * OUTWARD_PROBE_MM,
  }
  return pointInPolygon(probe, outline) ? { x: -normal.x, y: -normal.y } : normal
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

/** Form factor from a work-plane point to the part of an opening that its reveal leaves visible. */
function openingFormFactor(point: Point, opening: SkyOpening): number {
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

function skyOpenings(room: DaylightRoom): SkyOpening[] {
  return room.apertures
    .filter((aperture) => aperture.opensTo === 'sky')
    .map((aperture) => ({ aperture, outwardNormal: outwardNormal(aperture, room.outline) }))
}

function cellCenter(grid: DaylightField, column: number, row: number): Point {
  return {
    x: grid.origin.x + (column + CELL_CENTER_OFFSET) * grid.cellSize,
    y: grid.origin.y + (row + CELL_CENTER_OFFSET) * grid.cellSize,
  }
}

/** Measures the form factor from every cell center to every sky aperture of the cell's room. */
function measureGeometry(rooms: readonly DaylightRoom[]): SolverGeometry {
  const grid = createDaylightField(rooms)
  const openings = rooms.map(skyOpenings)
  const measured: RoomGeometry[] = rooms.map((room, index) => ({
    openToSky: room.openToSky === true,
    skyDirections: (openings[index] ?? []).map((opening) => skyDirection(opening.outwardNormal)),
    cells: [],
  }))
  for (let row = 0; row < grid.rows; row++) {
    for (let column = 0; column < grid.columns; column++) {
      const center = cellCenter(grid, column, row)
      // A cell belongs to the first room whose outline contains its center; a center on a wall
      // line counts as inside.
      const roomIndex = rooms.findIndex((room) => pointInPolygon(center, room.outline))
      if (rooms[roomIndex]?.openToSky === true) continue
      const roomOpenings = openings[roomIndex] ?? []
      measured[roomIndex]?.cells.push({
        visibilityIndex: daylightFieldCellIndex(grid, column, row) + SKY_VISIBILITY_CHANNEL,
        factors: roomOpenings.map((opening) => openingFormFactor(center, opening)),
      })
    }
  }
  return { grid, rooms: measured }
}

/** Weights the cached form factors by the sky; cells in no room and open-sky rooms keep 1. */
function fillField(
  geometry: SolverGeometry,
  sky: SkyLuminance,
  interreflection: (room: number) => number,
): DaylightField {
  const field = {
    ...geometry.grid,
    origin: { ...geometry.grid.origin },
    data: geometry.grid.data.slice(),
  }
  for (const [roomIndex, room] of geometry.rooms.entries()) {
    if (room.openToSky) continue
    const weights = room.skyDirections.map((direction) => sky(direction))
    const roomAverage = interreflection(roomIndex)
    for (const cell of room.cells) {
      const direct = cell.factors.reduce(
        (sum, factor, index) => sum + factor * (weights[index] ?? 0),
        0,
      )
      field.data[cell.visibilityIndex] = Math.min(OPEN_SKY_VISIBILITY, direct + roomAverage)
    }
  }
  return field
}

/**
 * Creates a solver for the rooms of one floor. A cell's visibility is the sum over its room's sky
 * apertures of the form factor from the cell center at the work plane to the opening, times the
 * sky's radiance toward the opening's facing, plus the room-average term, capped at 1. The form
 * factors depend on geometry alone, so the solver measures them on the first call and only
 * re-weights them for later skies. The rooms are read one time, on the first call of `field`; a
 * caller that changes the rooms builds a new solver.
 */
export function createDaylightFieldSolver(rooms: readonly DaylightRoom[]): DaylightFieldSolver {
  let geometry: SolverGeometry | null = null
  let geometryPasses = 0
  const measuredGeometry = (): SolverGeometry => {
    if (geometry === null) {
      geometry = measureGeometry(rooms)
      geometryPasses += 1
    }
    return geometry
  }
  const solver: DaylightFieldSolver = {
    field: (sky) => fillField(measuredGeometry(), sky, (room) => solver.interreflection(room, sky)),
    enteringFlux: () => 0,
    interreflection: () => 0,
    get geometryPasses() {
      return geometryPasses
    },
  }
  return solver
}
