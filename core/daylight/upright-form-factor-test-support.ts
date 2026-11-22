// core/daylight/upright-form-factor-test-support.ts
import type { Point } from '../model/types'
import type { UprightRectangle } from './upright-form-factor'

const POINTS_PER_AXIS = 40
const MIDPOINT = 0.5

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

function spanLength(rectangle: UprightRectangle): number {
  const [from, to] = rectangle.span
  return Math.hypot(to.x - from.x, to.y - from.y)
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
  const doorwayCell =
    (spanLength(doorway) / POINTS_PER_AXIS) * ((doorway.head - doorway.sill) / POINTS_PER_AXIS)
  const glazingCell =
    (spanLength(glazing) / POINTS_PER_AXIS) * ((glazing.head - glazing.sill) / POINTS_PER_AXIS)
  const facings: readonly [Point, Point] = [doorway.facing, glazing.facing]
  let total = 0
  for (const from of doorwaySamples) {
    for (const to of glazingSamples) total += pairKernel(from, to, facings)
  }
  return (total * doorwayCell * glazingCell) / (doorwayCell * POINTS_PER_AXIS * POINTS_PER_AXIS)
}
