// core/daylight/upright-form-factor-test-support.ts
import type { Point } from '../model/types'
import type { UprightRectangle } from './upright-form-factor'

const POINTS_PER_AXIS = 40
const SAMPLES_PER_RECTANGLE = POINTS_PER_AXIS * POINTS_PER_AXIS
const MIDPOINT = 0.5
const DEGREES_PER_HALF_TURN = 180
const QUARTER = 0.25

/** How closely a closed form must agree with `directSum`. */
export const SUM_TOLERANCE = 1e-3
export const DOORWAY_HEAD = 2100
export const WINDOW_SILL = 900
export const WINDOW_HEAD = 2100
/** The facing of glazing that stands on y = 0 in a room north of it. */
export const TOWARD_ROOM_FROM_GLAZING: Point = { x: 0, y: 1 }
/** The factor from a doorway on x = 0 (1000 to 2000) to glazing on y = 0 (1000 to 2000). */
export const RIGHT_ANGLE_FACTOR = 0.022433942847

export function relativeError(actual: number, expected: number): number {
  return Math.abs(actual - expected) / Math.abs(expected)
}

/**
 * The textbook configuration factor between two identical rectangles `a` by `b` that face each
 * other directly, `c` apart (the standard catalog of radiation configuration factors).
 */
export function opposedRectanglesFormFactor(a: number, b: number, c: number): number {
  const x = a / c
  const y = b / c
  const sx = Math.sqrt(1 + x * x)
  const sy = Math.sqrt(1 + y * y)
  const logTerm = Math.log(Math.sqrt(((1 + x * x) * (1 + y * y)) / (1 + x * x + y * y)))
  const atanTerms =
    x * sy * Math.atan(x / sy) + y * sx * Math.atan(y / sx) - x * Math.atan(x) - y * Math.atan(y)
  return (2 / (Math.PI * x * y)) * (logTerm + atanTerms)
}

/**
 * The textbook configuration factor between two rectangles at a right angle that share an edge of
 * length `edge`: from the one of width `from` to the one of width `to` (the standard catalog of
 * radiation configuration factors).
 */
export function commonEdgeFormFactor(edge: number, from: number, to: number): number {
  const w = from / edge
  const h = to / edge
  const r = w * w + h * h
  const root = Math.sqrt(r)
  const logArgument =
    (((1 + w * w) * (1 + h * h)) / (1 + r)) *
    Math.pow((w * w * (1 + r)) / ((1 + w * w) * r), w * w) *
    Math.pow((h * h * (1 + r)) / ((1 + h * h) * r), h * h)
  const terms =
    w * Math.atan(1 / w) +
    h * Math.atan(1 / h) -
    root * Math.atan(1 / root) +
    QUARTER * Math.log(logArgument)
  return terms / (Math.PI * w)
}

function rotate(vector: Point, cos: number, sin: number): Point {
  return { x: vector.x * cos - vector.y * sin, y: vector.x * sin + vector.y * cos }
}

/** The rectangle turned by `degrees` about the plan point `about`: its span and its facing rotate. */
export function turned(
  rectangle: UprightRectangle,
  degrees: number,
  about: Point,
): UprightRectangle {
  const angle = (degrees * Math.PI) / DEGREES_PER_HALF_TURN
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const turnPoint = (point: Point): Point => {
    const offset = rotate({ x: point.x - about.x, y: point.y - about.y }, cos, sin)
    return { x: about.x + offset.x, y: about.y + offset.y }
  }
  return {
    ...rectangle,
    span: [turnPoint(rectangle.span[0]), turnPoint(rectangle.span[1])],
    facing: rotate(rectangle.facing, cos, sin),
  }
}

interface Sample {
  readonly at: Point
  readonly height: number
}

function samples(rectangle: UprightRectangle): Sample[] {
  const [from, to] = rectangle.span
  const heightRange = rectangle.head - rectangle.sill
  const result: Sample[] = []
  for (let i = 0; i < POINTS_PER_AXIS; i += 1) {
    const along = (i + MIDPOINT) / POINTS_PER_AXIS
    const at = { x: from.x + (to.x - from.x) * along, y: from.y + (to.y - from.y) * along }
    for (let j = 0; j < POINTS_PER_AXIS; j += 1) {
      result.push({ at, height: rectangle.sill + (heightRange * (j + MIDPOINT)) / POINTS_PER_AXIS })
    }
  }
  return result
}

function cellArea(rectangle: UprightRectangle): number {
  const [from, to] = rectangle.span
  const spanLength = Math.hypot(to.x - from.x, to.y - from.y)
  return (spanLength / POINTS_PER_AXIS) * ((rectangle.head - rectangle.sill) / POINTS_PER_AXIS)
}

function pairKernel(doorway: Sample, glazing: Sample, facings: readonly [Point, Point]): number {
  if (glazing.height <= doorway.height) return 0
  const dx = glazing.at.x - doorway.at.x
  const dy = glazing.at.y - doorway.at.y
  const dz = glazing.height - doorway.height
  const distanceSquared = dx * dx + dy * dy + dz * dz
  const distance = Math.sqrt(distanceSquared)
  const cosDoorway = (facings[0].x * dx + facings[0].y * dy) / distance
  const cosGlazing = (-facings[1].x * dx - facings[1].y * dy) / distance
  if (cosDoorway <= 0 || cosGlazing <= 0) return 0
  return (cosDoorway * cosGlazing) / (Math.PI * distanceSquared)
}

/**
 * The definition of the doorway-to-glazing form factor as a midpoint sum, 40 points along each
 * span and each height. It counts only pairs where the glazing point is higher than the doorway
 * point and both cosines are positive, so a closed form can be checked against it.
 */
export function directSum(doorway: UprightRectangle, glazing: UprightRectangle): number {
  const doorwaySamples = samples(doorway)
  const glazingSamples = samples(glazing)
  const facings: readonly [Point, Point] = [doorway.facing, glazing.facing]
  let total = 0
  for (const from of doorwaySamples) {
    for (const to of glazingSamples) total += pairKernel(from, to, facings)
  }
  return (total * cellArea(glazing)) / SAMPLES_PER_RECTANGLE
}
