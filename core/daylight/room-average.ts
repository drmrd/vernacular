import type { LinearRgb } from '../color/oklab'
import { polygonArea } from '../geometry/polygon'
import type { Point } from '../model/types'
import type { DaylightRoom } from './daylight-field'
import { OPEN_SKY_VISIBILITY } from './daylight-field'

/** Share of light that an unpainted surface reflects: the luminance of the wall color #d8d4cc. */
export const UNPAINTED_SURFACE_REFLECTANCE = 0.66

/** Rec. 709 luminance weights of linear red, green, and blue. */
const LUMINANCE_RED = 0.2126
const LUMINANCE_GREEN = 0.7152
const LUMINANCE_BLUE = 0.0722

/**
 * Share of the open sky that a vertical opening sees: the form factor from a vertical plane to the
 * half of its view that lies above the horizon.
 */
const VERTICAL_OPENING_SKY_SHARE = 0.5

/** The surfaces of a room that pass light back and forth. */
export interface RoomSurfaces {
  /** Floor, ceiling, and walls together, in plan square millimetres. */
  area: number
  /** Area-weighted share of light that the surfaces reflect, from 0 up to but not including 1. */
  meanReflectance: number
}

/** An opening's size as the entering flux sees it. */
export interface OpeningArea {
  /** Width times the height from sill to head, in plan square millimetres. */
  openingArea: number
}

function floorReflectance(color: LinearRgb): number {
  const luminance = LUMINANCE_RED * color.r + LUMINANCE_GREEN * color.g + LUMINANCE_BLUE * color.b
  return Math.min(1, Math.max(0, luminance))
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
 * `UNPAINTED_SURFACE_REFLECTANCE`. A room with no surface area reflects nothing.
 */
export function measureRoomSurfaces(room: DaylightRoom): RoomSurfaces {
  const floorArea = Math.abs(polygonArea(room.outline))
  const area = 2 * floorArea + outlinePerimeter(room.outline) * room.ceilingHeight
  if (!(area > 0)) return { area: 0, meanReflectance: 0 }
  const reflected =
    floorArea * floorReflectance(room.floorColor) +
    (area - floorArea) * UNPAINTED_SURFACE_REFLECTANCE
  return { area, meanReflectance: reflected / area }
}

/**
 * Light that enters a room, in plan square millimetres of open sky: the sum over its openings of
 * half the opening area times the opening's weight (the radiance it faces, relative to the open sky).
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
 * `flux * rho / (S * (1 - rho))`, the sum of the geometric series of reflections spread over the
 * surface area `S` with mean reflectance `rho`.
 */
export function roomAverageTerm(flux: number, surfaces: RoomSurfaces): number {
  if (!(surfaces.area > 0)) return 0
  const reflectance = surfaces.meanReflectance
  return (flux * reflectance) / (surfaces.area * (1 - reflectance))
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
