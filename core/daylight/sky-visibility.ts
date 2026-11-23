import type { Vector3 } from '../scene/vector3'
import type { DaylightField, DaylightRoom } from './daylight-field'
import { OPEN_SKY_VISIBILITY } from './daylight-field'
import { apertureWeights, doorwayLuminance, routedOutFluxes } from './doorway-light'
import { cellVisibility, enteringFlux, roomAverageTerm } from './room-average'
import type { RoomGeometry, SolverGeometry } from './room-geometry'
import { measureGeometry } from './room-geometry'

export { UNPAINTED_SURFACE_REFLECTANCE } from './room-average'
export { DAYLIGHT_WORK_PLANE_HEIGHT_MM } from './room-geometry'

/**
 * Relative radiance of the sky toward a world direction (unit vector, Y up); 1 is the mean of the
 * open sky, so a brighter part of the dome lets more light through a window that faces it.
 */
export type SkyLuminance = (direction: Vector3) => number

/** A sky of the same radiance in every direction: each window passes its bare form factor. */
export const UNIFORM_SKY: SkyLuminance = () => 1

/** Computes the sky visibility of the rooms of one floor for any sky, from geometry it measures once. */
export interface DaylightFieldSolver {
  /** The field for this sky; each cell holds the share of open-sky light it receives. */
  field(sky: SkyLuminance): DaylightField
  /**
   * Light that enters the room through its apertures, in plan square millimetres of open sky: each
   * opening's area times its flux share (one half for a window and for a doorway into a room open
   * to the sky, 1 for a doorway into any other room) times its net transmittance times the
   * radiance it faces, relative to the open sky. A doorway's weight includes the window light of
   * the room it opens to that lands on it, so this is the whole flux through the room's apertures.
   */
  enteringFlux(room: number, sky: SkyLuminance): number
  /**
   * Share of open-sky light that reaches every point of the room after bouncing between surfaces.
   * The flux that bounces is the entering flux less the window light that the doorways listed into
   * the room carry away before any reflection.
   */
  interreflection(room: number, sky: SkyLuminance): number
  /** How many times the solver has measured the aperture-to-cell form factors. */
  readonly geometryPasses: number
}

/** The light of one room under one sky. */
interface RoomLight {
  /** Weight of each aperture, relative to the open sky. */
  weights: readonly number[]
  enteringFlux: number
  interreflection: number
}

/**
 * Reads the sky's radiance toward a direction as a weight: a value below 0 or `NaN` is no light,
 * so it counts as 0. A value above 1 is legal (a part of the dome brighter than the mean), so
 * nothing caps it here; only a cell's final visibility is capped.
 */
function readSkyRadiance(sky: SkyLuminance, direction: Vector3): number {
  const radiance = sky(direction)
  return Number.isNaN(radiance) || radiance < 0 ? 0 : radiance
}

function skyWeights(room: RoomGeometry, sky: SkyLuminance): number[] {
  return room.apertures.map((aperture) =>
    aperture.kind === 'sky'
      ? readSkyRadiance(sky, aperture.direction) * aperture.netTransmittance
      : 0,
  )
}

/** Weights every aperture of every room by the sky, then sums each room's entering flux. */
function lightRooms(geometry: SolverGeometry, sky: SkyLuminance): RoomLight[] {
  const skyOnly = geometry.rooms.map((room) => skyWeights(room, sky))
  const routedOut = routedOutFluxes(geometry.rooms, skyOnly)
  const luminances = geometry.rooms.map((room, index) =>
    doorwayLuminance(room, skyOnly[index] ?? [], routedOut[index] ?? 0),
  )
  return geometry.rooms.map((room, index) => {
    const weights = apertureWeights(room, skyOnly[index] ?? [], { skyWeights: skyOnly, luminances })
    const flux = enteringFlux(room.apertures, weights)
    return {
      weights,
      enteringFlux: flux,
      interreflection: roomAverageTerm(flux - (routedOut[index] ?? 0), room.surfaces),
    }
  })
}

/**
 * Weights the cached form factors, then copies each source value into its cell under a wall.
 * Open-sky rooms and the other cells in no room keep 1.
 */
function fillField(geometry: SolverGeometry, light: readonly RoomLight[]): DaylightField {
  const field = {
    ...geometry.grid,
    origin: { ...geometry.grid.origin },
    data: geometry.grid.data.slice(),
  }
  for (const [roomIndex, room] of geometry.rooms.entries()) {
    const roomLight = light[roomIndex]
    if (room.openToSky || roomLight === undefined) continue
    for (const cell of room.cells) {
      field.data[cell.visibilityIndex] = cellVisibility(
        cell.factors,
        roomLight.weights,
        roomLight.interreflection,
      )
    }
  }
  for (const copy of geometry.cellsUnderWalls) {
    field.data[copy.targetIndex] = field.data[copy.sourceIndex] ?? OPEN_SKY_VISIBILITY
  }
  return field
}

/**
 * Creates a solver for the rooms of one floor. A cell's visibility is the sum over its room's
 * apertures of the form factor from the cell center at the work plane to the opening, times the
 * opening's weight, plus the room-average term, capped at 1. A sky aperture weighs the sky's
 * radiance toward its facing times its net transmittance; a doorway weighs the luminance of the
 * room it opens to, plus the window light of that room that lands on the doorway, times its net
 * transmittance (that luminance is the room-average term of that room, lit by its sky apertures
 * alone less the window light that the doorways other rooms list into it carry away; 1 for a room
 * open to the sky). A cell whose center lies in
 * no room, with a cell of a room (a room open to the sky counts) among its eight neighbors, holds
 * the sky visibility of one such neighbor; only cells whose center lies in a room are sources. The
 * room is the one whose outline lies nearest the cell's center, and on an equal distance the first
 * in the input; among its neighbors the source is the nearest, and on a tie the first in the order
 * left, right, below, above, lower left, lower right, upper left, upper right. Every other cell in
 * no room holds 1. The form factors depend on geometry alone, so the solver checks and measures
 * the rooms one time, and only re-weights them for later skies; a caller that changes the rooms
 * builds a new solver. That check runs on the first call of any method, not when the solver is
 * created, so a room or an aperture that the field cannot use throws a RangeError that names it
 * from that first call.
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
  const roomLight = (room: number, sky: SkyLuminance): RoomLight | undefined =>
    lightRooms(measuredGeometry(), sky)[room]
  return {
    field: (sky) => fillField(measuredGeometry(), lightRooms(measuredGeometry(), sky)),
    enteringFlux: (room, sky) => roomLight(room, sky)?.enteringFlux ?? 0,
    interreflection: (room, sky) => roomLight(room, sky)?.interreflection ?? 0,
    get geometryPasses() {
      return geometryPasses
    },
  }
}
