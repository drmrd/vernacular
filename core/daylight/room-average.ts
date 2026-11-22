import { linearLuminance } from '../color/contrast'
import type { LinearRgb } from '../color/oklab'
import { polygonArea } from '../geometry/polygon'
import type { Point } from '../model/types'
import type { DaylightRoom } from './daylight-field'
import { OPEN_SKY_VISIBILITY } from './daylight-field'

/** Share of light that an unpainted surface reflects: the luminance of the wall color #d8d4cc. */
export const UNPAINTED_SURFACE_REFLECTANCE = 0.66

/**
 * Share of the open sky that a vertical opening sees: the form factor from a vertical plane to the
 * half of its view that lies above the horizon.
 */
const VERTICAL_OPENING_SKY_SHARE = 0.5

/** The surfaces of a room that pass light back and forth. */
export interface RoomSurfaces {
  /**
   * Floor, ceiling, and walls together, plus every doorway that opens into the room, in plan
   * square millimetres.
   */
  area: number
  /**
   * Share of light that the floor reflects, from 0 to 1: the luminance of the floor color. The
   * first reflection of the light that enters the room lands on the floor, so it uses this share.
   */
  firstReflectance: number
  /**
   * Area-weighted share of light that the surfaces reflect, from 0 up to but not including 1. The
   * doorways that open into the room count at 0.
   */
  meanReflectance: number
}

/** An opening's size as the entering flux sees it. */
export interface OpeningArea {
  /** Width times the height from sill to head, in plan square millimetres. */
  openingArea: number
}

function floorReflectance(color: LinearRgb): number {
  return Math.min(1, Math.max(0, linearLuminance(color)))
}

function outlinePerimeter(outline: readonly Point[]): number {
  return outline.reduce((sum, current, index) => {
    const next = outline[(index + 1) % outline.length] ?? current
    return sum + Math.hypot(next.x - current.x, next.y - current.y)
  }, 0)
}

/**
 * The surfaces of a room: twice the floor area (floor and ceiling) plus the perimeter times the
 * ceiling height. The floor reflects the luminance of its color and every other surface reflects
 * `UNPAINTED_SURFACE_REFLECTANCE`. The mean reflectance weighs every surface by its area and the
 * first reflectance is the floor's alone. A room with no surface area reflects nothing.
 * `doorwayArea` is the total opening area of the doorways that open into the room: it joins the
 * surface area and reflects nothing, so the room loses the light that leaves through it.
 */
export function measureRoomSurfaces(room: DaylightRoom, doorwayArea: number): RoomSurfaces {
  const floorArea = Math.abs(polygonArea(room.outline))
  const area = 2 * floorArea + outlinePerimeter(room.outline) * room.ceilingHeight
  if (!(area > 0)) return { area: 0, firstReflectance: 0, meanReflectance: 0 }
  const firstReflectance = floorReflectance(room.floorColor)
  const reflected =
    floorArea * firstReflectance + (area - floorArea) * UNPAINTED_SURFACE_REFLECTANCE
  const totalArea = area + doorwayArea
  return { area: totalArea, firstReflectance, meanReflectance: reflected / totalArea }
}

/**
 * Light that enters a room, in plan square millimetres of open sky: the sum over its openings of
 * half the opening area times the opening's weight (the radiance it faces times its net
 * transmittance, relative to the open sky).
 */
export function enteringFlux(openings: readonly OpeningArea[], weights: readonly number[]): number {
  return openings.reduce(
    (sum, opening, index) =>
      sum + VERTICAL_OPENING_SKY_SHARE * (weights[index] ?? 0) * opening.openingArea,
    0,
  )
}

/**
 * Share of open-sky light that reaches every point of a room after bouncing between its surfaces:
 * `flux * rhoFloor / (S * (1 - rho))`. The first reflection lands on the floor, so it keeps the
 * floor's reflectance `rhoFloor`; the later bounces keep the mean reflectance `rho` of the
 * surfaces, which makes the sum of a geometric series spread over the surface area `S`.
 */
export function roomAverageTerm(flux: number, surfaces: RoomSurfaces): number {
  if (!(surfaces.area > 0)) return 0
  const { firstReflectance, meanReflectance } = surfaces
  return (flux * firstReflectance) / (surfaces.area * (1 - meanReflectance))
}

/**
 * Sky visibility of one cell: the form factor to each opening times the opening's weight, plus
 * the room-average term, capped at the open-sky value of 1.
 */
export function cellVisibility(
  factors: readonly number[],
  weights: readonly number[],
  roomAverage: number,
): number {
  const direct = factors.reduce((sum, factor, index) => sum + factor * (weights[index] ?? 0), 0)
  return Math.min(OPEN_SKY_VISIBILITY, direct + roomAverage)
}
