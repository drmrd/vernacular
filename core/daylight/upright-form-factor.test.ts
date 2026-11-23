// core/daylight/upright-form-factor.test.ts
import { describe, expect, it } from 'vitest'
import type { Point } from '../model/types'
import { doorwayToGlazingFormFactor } from './upright-form-factor'
import type { UprightRectangle } from './upright-form-factor'
import {
  commonEdgeFormFactor,
  directSum,
  opposedRectanglesFormFactor,
  relativeError,
  turned,
} from './upright-form-factor-test-support'

const RELATIVE_TOLERANCE = 1e-9
const REORDER_TOLERANCE = 1e-12
const SUM_TOLERANCE = 1e-3
const SQUARE = 1000
const TWO_SQUARES = 2000
const TOWARD_WINDOW: Point = { x: 1, y: 0 }
const TOWARD_DOORWAY: Point = { x: -1, y: 0 }
const DOORWAY_HEAD = 2100
const WINDOW_SILL = 900
const WINDOW_HEAD = 2100
const WINDOW_DISTANCE = 4000
const SIDE_DOORWAY_WIDTH = 600
const TOWARD_ROOM_FROM_GLAZING: Point = { x: 0, y: 1 }
const TURN_ABOUT: Point = { x: 3000.7, y: 1000.3 }
const NEAR_FACING_MARGIN = 1.1e-9
const THIRTY_DEGREES = 30
const TEN_DEGREES = 10
const DEGENERATE_SPAN_TOLERANCE = 1e-12
const NARROW_WINDOW_WHOLE_WALLS = { width: 500, depth: 6000, height: 2600, share: 0.40075578118 }
const RIGHT_ANGLE_TOLERANCE = 1e-9
const RIGHT_ANGLE_FACTOR = 0.022433942847

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
  head: WINDOW_HEAD,
})
const SIDE_DOORWAY = doorwayOn({ along: [2200, 2800], sill: 0, head: DOORWAY_HEAD })

/** The textbook factor from a doorway to glazing that lies wholly above it, both `SQUARE` wide. */
function stackedTextbookFactor(
  doorwayHeights: readonly [number, number],
  glazingHeights: readonly [number, number],
): number {
  const halfExchange = (rise: number) =>
    (SQUARE * rise * opposedRectanglesFormFactor(SQUARE, rise, SQUARE)) / 2
  const [sill, head] = doorwayHeights
  const [glazingSill, glazingHead] = glazingHeights
  const exchange =
    halfExchange(glazingHead - sill) +
    halfExchange(glazingSill - head) -
    halfExchange(glazingHead - head) -
    halfExchange(glazingSill - sill)
  return exchange / (SQUARE * (head - sill))
}

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
    const halfWindowArea = (SQUARE * (WINDOW_HEAD - WINDOW_SILL)) / 2
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
    const factor = doorwayToGlazingFormFactor(SIDE_DOORWAY, TEST_WINDOW)
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
    const reverse = (rectangle: UprightRectangle) => ({
      ...rectangle,
      span: [rectangle.span[1], rectangle.span[0]] as const,
    })
    const factor = doorwayToGlazingFormFactor(TEST_DOORWAY, TEST_WINDOW)
    const reorderings = [
      doorwayToGlazingFormFactor(TEST_DOORWAY, reverse(TEST_WINDOW)),
      doorwayToGlazingFormFactor(reverse(TEST_DOORWAY), TEST_WINDOW),
      doorwayToGlazingFormFactor(reverse(TEST_DOORWAY), reverse(TEST_WINDOW)),
    ]
    for (const reordered of reorderings) {
      expect(relativeError(reordered, factor)).toBeLessThan(REORDER_TOLERANCE)
    }
  })

  it('gives 0 for glazing whose span has equal ends', () => {
    const point = { x: WINDOW_DISTANCE, y: 1500 }
    const glazing = { ...TEST_WINDOW, span: [point, point] as const }
    expect(Math.abs(doorwayToGlazingFormFactor(TEST_DOORWAY, glazing))).toBeLessThan(
      DEGENERATE_SPAN_TOLERANCE,
    )
  })

  it('gives the textbook factor for a doorway that stands above the floor', () => {
    const factor = squares([SQUARE, TWO_SQUARES], [3 * SQUARE, 4 * SQUARE])
    const expected = stackedTextbookFactor([SQUARE, TWO_SQUARES], [3 * SQUARE, 4 * SQUARE])
    expect(relativeError(factor, expected)).toBeLessThan(RELATIVE_TOLERANCE)
  })

  it('gives 0 for glazing on the same plane as the doorway', () => {
    const coplanar = glazingOn(0, { along: [1000, 2000], sill: WINDOW_SILL, head: WINDOW_HEAD })
    expect(doorwayToGlazingFormFactor(TEST_DOORWAY, coplanar)).toBe(0)
  })

  it('still counts walls as facing when turning leaves their normals a rounding error from opposite', () => {
    const doorway = turned(TEST_DOORWAY, TEN_DEGREES, TURN_ABOUT)
    const glazing = turned(TEST_WINDOW, TEN_DEGREES, TURN_ABOUT)
    expect(
      relativeError(doorwayToGlazingFormFactor(doorway, glazing), 0.015164566934),
    ).toBeLessThan(RELATIVE_TOLERANCE)
  })

  it('does not count walls as facing when their normals are only close to opposite', () => {
    const facingValue = doorwayToGlazingFormFactor(SIDE_DOORWAY, TEST_WINDOW)
    const x = 1 - NEAR_FACING_MARGIN
    const nearlyFacing = { ...SIDE_DOORWAY, facing: { x, y: Math.sqrt(1 - x * x) } }
    const factor = doorwayToGlazingFormFactor(nearlyFacing, TEST_WINDOW)
    expect(relativeError(factor, facingValue)).toBeGreaterThan(RELATIVE_TOLERANCE)
  })
})

describe('the form factor from a doorway to glazing on an adjoining wall at a right angle', () => {
  const adjoiningGlazing = (
    along: readonly [number, number],
    heights: readonly [number, number],
  ) => ({
    span: [
      { x: along[0], y: 0 },
      { x: along[1], y: 0 },
    ] as const,
    sill: heights[0],
    head: heights[1],
    facing: TOWARD_ROOM_FROM_GLAZING,
  })
  const cornerSquares = (
    doorwayHeights: readonly [number, number],
    glazingHeights: readonly [number, number],
  ) =>
    doorwayToGlazingFormFactor(
      doorwayOn({ along: [0, SQUARE], sill: doorwayHeights[0], head: doorwayHeights[1] }),
      adjoiningGlazing([0, SQUARE], glazingHeights),
    )
  const sidePair = (glazingAlong: readonly [number, number]) => ({
    doorway: doorwayOn({ along: [1000, 2000], sill: 0, head: DOORWAY_HEAD }),
    glazing: adjoiningGlazing(glazingAlong, [WINDOW_SILL, WINDOW_HEAD]),
  })

  it('gives half the textbook factor of two squares with a common edge', () => {
    const expected = 0.5 * commonEdgeFormFactor(SQUARE, SQUARE, SQUARE)
    expect(relativeError(cornerSquares([0, SQUARE], [0, SQUARE]), expected)).toBeLessThan(
      RELATIVE_TOLERANCE,
    )
  })

  it('gives the whole textbook factor when the glazing lies above the doorway', () => {
    const expected =
      commonEdgeFormFactor(TWO_SQUARES, SQUARE, SQUARE) -
      commonEdgeFormFactor(SQUARE, SQUARE, SQUARE)
    expect(relativeError(cornerSquares([0, SQUARE], [SQUARE, TWO_SQUARES]), expected)).toBeLessThan(
      RELATIVE_TOLERANCE,
    )
  })

  it('gives 0 when the glazing lies below the doorway', () => {
    expect(cornerSquares([SQUARE, TWO_SQUARES], [0, SQUARE])).toBe(0)
  })

  it('gives 0.0224339428 for a doorway and a window that stand 1000 mm from the corner', () => {
    const { doorway, glazing } = sidePair([1000, 2000])
    const factor = doorwayToGlazingFormFactor(doorway, glazing)
    expect(relativeError(factor, 0.022433942847)).toBeLessThan(RELATIVE_TOLERANCE)
    expect(relativeError(factor * SQUARE * DOORWAY_HEAD, 47111.2799778)).toBeLessThan(
      RELATIVE_TOLERANCE,
    )
    expect(relativeError(factor, directSum(doorway, glazing))).toBeLessThan(SUM_TOLERANCE)
  })

  it.each([
    NARROW_WINDOW_WHOLE_WALLS,
    { width: 100, depth: 40000, height: 6000, share: 0.48513074821 },
    { width: 4000, depth: 40000, height: 6000, share: 0.29301394035 },
  ])(
    'gives the textbook share for whole walls that meet at the corner, $width and $depth wide under $height',
    ({ width, depth, height, share }) => {
      const doorway = doorwayOn({ along: [0, depth], sill: 0, head: height })
      const glazing = adjoiningGlazing([0, width], [0, height])
      const factor = doorwayToGlazingFormFactor(doorway, glazing)
      const measured = (factor * depth) / (0.5 * width)
      expect(relativeError(measured, commonEdgeFormFactor(height, width, depth))).toBeLessThan(
        RELATIVE_TOLERANCE,
      )
      expect(relativeError(measured, share)).toBeLessThan(RELATIVE_TOLERANCE)
    },
  )

  it('counts only the part of the glazing in front of the doorway', () => {
    const { doorway, glazing } = sidePair([-500, 1000])
    const factor = doorwayToGlazingFormFactor(doorway, glazing)
    expect(relativeError(factor, 0.020059672794)).toBeLessThan(RELATIVE_TOLERANCE)
    const inFront = doorwayToGlazingFormFactor(doorway, sidePair([0, 1000]).glazing)
    expect(relativeError(factor, inFront)).toBeLessThan(RELATIVE_TOLERANCE)
  })

  it('gives the same factor for a pair turned by 30 degrees', () => {
    const { doorway, glazing } = sidePair([1000, 2000])
    const turnedFactor = doorwayToGlazingFormFactor(
      turned(doorway, THIRTY_DEGREES, TURN_ABOUT),
      turned(glazing, THIRTY_DEGREES, TURN_ABOUT),
    )
    expect(relativeError(turnedFactor, 0.022433942847)).toBeLessThan(RELATIVE_TOLERANCE)
    const { width, depth, height, share } = NARROW_WINDOW_WHOLE_WALLS
    const wholeWallDoorway = doorwayOn({ along: [0, depth], sill: 0, head: height })
    const wholeWallGlazing = adjoiningGlazing([0, width], [0, height])
    const wholeWalls = doorwayToGlazingFormFactor(
      turned(wholeWallDoorway, THIRTY_DEGREES, TURN_ABOUT),
      turned(wholeWallGlazing, THIRTY_DEGREES, TURN_ABOUT),
    )
    const measured = (wholeWalls * depth) / (0.5 * width)
    expect(relativeError(measured, share)).toBeLessThan(RELATIVE_TOLERANCE)
  })

  it('gives 0 when the two do not face each other', () => {
    const { doorway, glazing } = sidePair([1000, 2000])
    const reversedGlazing = { ...glazing, facing: { x: 0, y: -1 } }
    const reversedDoorway = { ...doorway, facing: TOWARD_DOORWAY }
    expect(doorwayToGlazingFormFactor(doorway, reversedGlazing)).toBe(0)
    expect(doorwayToGlazingFormFactor(reversedDoorway, glazing)).toBe(0)
  })

  it('counts walls as at a right angle when their normals have a dot product of exactly the tolerance', () => {
    const { doorway, glazing } = sidePair([1000, 2000])
    const edgeOfRightAngle = { ...glazing, facing: { x: RIGHT_ANGLE_TOLERANCE, y: 1 } }
    const factor = doorwayToGlazingFormFactor(doorway, edgeOfRightAngle)
    expect(relativeError(factor, RIGHT_ANGLE_FACTOR)).toBeLessThan(RELATIVE_TOLERANCE)
  })
})
