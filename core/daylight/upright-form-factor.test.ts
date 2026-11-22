// core/daylight/upright-form-factor.test.ts
import { describe, expect, it } from 'vitest'
import type { Point } from '../model/types'
import { doorwayToGlazingFormFactor } from './upright-form-factor'
import type { UprightRectangle } from './upright-form-factor'
import { directSum, opposedRectanglesFormFactor } from './upright-form-factor-test-support'

const RELATIVE_TOLERANCE = 1e-9
const REORDER_TOLERANCE = 1e-12
const SUM_TOLERANCE = 1e-3
const SQUARE = 1000
const TWO_SQUARES = 2000
const TOWARD_WINDOW: Point = { x: 1, y: 0 }
const TOWARD_DOORWAY: Point = { x: -1, y: 0 }
const DOORWAY_HEAD = 2100
const WINDOW_SILL = 900
const WINDOW_DISTANCE = 4000
const SIDE_DOORWAY_WIDTH = 600

function relativeError(actual: number, expected: number): number {
  return Math.abs(actual - expected) / Math.abs(expected)
}

interface Extent {
  /** Start and end along the wall, in plan millimetres. */
  readonly along: readonly [number, number]
  readonly sill: number
  readonly head: number
}

function rectangleOn(distance: number, extent: Extent, facing: Point): UprightRectangle {
  return {
    span: [
      { x: distance, y: extent.along[0] },
      { x: distance, y: extent.along[1] },
    ],
    sill: extent.sill,
    head: extent.head,
    facing,
  }
}

function doorwayOn(extent: Extent): UprightRectangle {
  return rectangleOn(0, extent, TOWARD_WINDOW)
}

function glazingOn(distance: number, extent: Extent): UprightRectangle {
  return rectangleOn(distance, extent, TOWARD_DOORWAY)
}

function squares(
  doorwayHeights: readonly [number, number],
  glazingHeights: readonly [number, number],
) {
  const square = (heights: readonly [number, number]): Extent => ({
    along: [0, SQUARE],
    sill: heights[0],
    head: heights[1],
  })
  return doorwayToGlazingFormFactor(
    doorwayOn(square(doorwayHeights)),
    glazingOn(SQUARE, square(glazingHeights)),
  )
}

const TEST_DOORWAY = doorwayOn({ along: [1000, 2000], sill: 0, head: DOORWAY_HEAD })
const TEST_WINDOW = glazingOn(WINDOW_DISTANCE, {
  along: [1000, 2000],
  sill: WINDOW_SILL,
  head: DOORWAY_HEAD,
})

describe('the form factor from a doorway to glazing on the facing wall counts only light that travels downward', () => {
  it('gives half the textbook factor of two opposed squares that span the same heights', () => {
    const expected = 0.5 * opposedRectanglesFormFactor(SQUARE, SQUARE, SQUARE)
    expect(relativeError(squares([0, SQUARE], [0, SQUARE]), expected)).toBeLessThan(
      RELATIVE_TOLERANCE,
    )
  })

  it('gives the whole textbook factor when the glazing lies above the doorway', () => {
    const expected =
      opposedRectanglesFormFactor(SQUARE, TWO_SQUARES, SQUARE) -
      opposedRectanglesFormFactor(SQUARE, SQUARE, SQUARE)
    expect(relativeError(squares([0, SQUARE], [SQUARE, TWO_SQUARES]), expected)).toBeLessThan(
      RELATIVE_TOLERANCE,
    )
  })

  it('gives 0 when the glazing lies below the doorway', () => {
    expect(squares([SQUARE, TWO_SQUARES], [0, SQUARE])).toBe(0)
  })

  it('gives 0.0151645669 for the test pair, a doorway that the window faces straight on', () => {
    const factor = doorwayToGlazingFormFactor(TEST_DOORWAY, TEST_WINDOW)
    const doorwayArea = SQUARE * DOORWAY_HEAD
    const halfWindowArea = (SQUARE * (DOORWAY_HEAD - WINDOW_SILL)) / 2
    const plainDiffuseFactor = 0.021659940578
    expect(relativeError(factor, 0.015164566934)).toBeLessThan(RELATIVE_TOLERANCE)
    expect(relativeError(factor * doorwayArea, 31845.5905621)).toBeLessThan(RELATIVE_TOLERANCE)
    expect(relativeError((factor * doorwayArea) / halfWindowArea, 0.05307598427)).toBeLessThan(
      RELATIVE_TOLERANCE,
    )
    expect(factor).toBeLessThan(plainDiffuseFactor)
    expect(relativeError(factor, directSum(TEST_DOORWAY, TEST_WINDOW))).toBeLessThan(SUM_TOLERANCE)
  })

  it('gives 0.0136526455 for a doorway to one side of the window', () => {
    const sideDoorway = doorwayOn({ along: [2200, 2800], sill: 0, head: DOORWAY_HEAD })
    const factor = doorwayToGlazingFormFactor(sideDoorway, TEST_WINDOW)
    expect(relativeError(factor, 0.013652645492)).toBeLessThan(RELATIVE_TOLERANCE)
    expect(relativeError(factor * SIDE_DOORWAY_WIDTH * DOORWAY_HEAD, 17202.3333205)).toBeLessThan(
      RELATIVE_TOLERANCE,
    )
  })

  it('gives 0 when the two do not face each other', () => {
    const reversedWindow = { ...TEST_WINDOW, facing: TOWARD_WINDOW }
    const reversedDoorway = { ...TEST_DOORWAY, facing: TOWARD_DOORWAY }
    expect(doorwayToGlazingFormFactor(TEST_DOORWAY, reversedWindow)).toBe(0)
    expect(doorwayToGlazingFormFactor(reversedDoorway, TEST_WINDOW)).toBe(0)
    expect(doorwayToGlazingFormFactor(reversedDoorway, reversedWindow)).toBe(0)
  })

  it("does not depend on the order of a span's two ends", () => {
    const [from, to] = TEST_WINDOW.span
    const reversed = { ...TEST_WINDOW, span: [to, from] as const }
    const factor = doorwayToGlazingFormFactor(TEST_DOORWAY, TEST_WINDOW)
    expect(relativeError(doorwayToGlazingFormFactor(TEST_DOORWAY, reversed), factor)).toBeLessThan(
      REORDER_TOLERANCE,
    )
  })
})
