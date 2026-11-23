import { distance } from '../geometry/point'
import { UNIT_NORMAL_DOT_LIMIT as ORIENTATION_TOLERANCE } from '../geometry/tolerance'
import { dot, leftPerp, shift, subtract, unit } from '../geometry/vector'
import type { Point } from '../model/types'

/** A rectangle that stands on a wall. */
export interface UprightRectangle {
  /** The two ends of its foot, in plan millimetres. */
  span: readonly [Point, Point]
  /** Heights of its lower and upper edge above the floor, in millimetres. */
  sill: number
  head: number
  /** Unit plan vector, square to the span, that points into the room both rectangles bound. */
  facing: Point
}

const LOG_TERM_WEIGHT = 0.25

const QUADRATURE_POINT_COUNT = 16
const NEWTON_STEP_COUNT = 8
const ROOT_ESTIMATE_INDEX_SHIFT = 0.75
const ROOT_ESTIMATE_DEGREE_SHIFT = 0.5

interface QuadraturePoint {
  position: number
  weight: number
}

/** The Legendre polynomial of the given degree and its derivative at x, by the three-term recurrence. */
function legendreWithDerivative(degree: number, x: number): { value: number; derivative: number } {
  let previous = 1
  let value = x
  for (let order = 2; order <= degree; order++) {
    ;[previous, value] = [value, ((2 * order - 1) * x * value - (order - 1) * previous) / order]
  }
  return { value, derivative: (degree * (x * value - previous)) / (x * x - 1) }
}

/**
 * The Gauss-Legendre nodes and weights on the interval from 0 to 1. Each node starts from the standard
 * asymptotic estimate of a Legendre root, cos(pi (i + 3/4) / (n + 1/2)); Newton's iteration converges
 * quadratically, so 8 steps from it reach double precision.
 */
function gaussLegendreOnUnitInterval(pointCount: number): QuadraturePoint[] {
  const newtonStep = (x: number): number => {
    const { value, derivative } = legendreWithDerivative(pointCount, x)
    return x - value / derivative
  }
  return Array.from({ length: pointCount }, (_, index) => {
    const estimate = Math.cos(
      (Math.PI * (index + ROOT_ESTIMATE_INDEX_SHIFT)) / (pointCount + ROOT_ESTIMATE_DEGREE_SHIFT),
    )
    const x = Array.from({ length: NEWTON_STEP_COUNT }).reduce<number>(newtonStep, estimate)
    const { derivative } = legendreWithDerivative(pointCount, x)
    return { position: (x + 1) / 2, weight: 1 / ((1 - x * x) * derivative * derivative) }
  })
}

const QUADRATURE_POINTS = gaussLegendreOnUnitInterval(QUADRATURE_POINT_COUNT)

interface SignedPosition {
  position: number
  sign: number
}

interface HeightTerm {
  height: number
  sign: number
}

/** The larger end of a span along a direction counts +1 and the smaller end -1. */
function signedEnds(span: readonly [Point, Point], direction: Point): SignedPosition[] {
  const first = dot(span[0], direction)
  const second = dot(span[1], direction)
  return first > second
    ? [
        { position: first, sign: 1 },
        { position: second, sign: -1 },
      ]
    : [
        { position: second, sign: 1 },
        { position: first, sign: -1 },
      ]
}

/** Only light that travels downward counts, so each height difference is cut off at 0. */
function heightTerms(doorway: UprightRectangle, glazing: UprightRectangle): HeightTerm[] {
  return [
    { height: glazing.head - doorway.sill, sign: 1 },
    { height: glazing.sill - doorway.head, sign: 1 },
    { height: glazing.head - doorway.head, sign: -1 },
    { height: glazing.sill - doorway.sill, sign: -1 },
  ].map(({ height, sign }) => ({ height: Math.max(height, 0), sign }))
}

/**
 * The fourfold antiderivative G(u, v) of the facing-walls exchange, in square millimetres. Its signed
 * sum over the span ends and height terms is the exchange area.
 */
function facingAntiderivative(offset: number, height: number, gap: number): number {
  const offsetRoot = Math.sqrt(offset * offset + gap * gap)
  const heightRoot = Math.sqrt(height * height + gap * gap)
  return (
    (height * offsetRoot * Math.atan(height / offsetRoot) +
      offset * heightRoot * Math.atan(offset / heightRoot) -
      (gap * gap * Math.log(offset * offset + height * height + gap * gap)) / 2) /
    (2 * Math.PI)
  )
}

/**
 * The fourfold antiderivative g(m, v) of the right-angle exchange, in square millimetres, where m is
 * the sum of the squared distances of a glazing end and a doorway end from the other's plane.
 */
function rightAngleAntiderivative(squaredReach: number, height: number): number {
  const squaredReachAndHeight = squaredReach + height * height
  if (squaredReachAndHeight === 0) return 0
  const reach = Math.sqrt(squaredReach)
  return (
    (-height * reach * Math.atan2(height, reach) +
      (squaredReach - height * height) * Math.log(squaredReachAndHeight) * LOG_TERM_WEIGHT) /
    (2 * Math.PI)
  )
}

function signedHeightSum(terms: readonly HeightTerm[], kernel: (height: number) => number): number {
  return terms.reduce((sum, term) => sum + term.sign * kernel(term.height), 0)
}

/** Sums a value over every glazing end and doorway end pair, each weighted by the product of their signs. */
function sumOverEndPairs(
  glazingEnds: readonly SignedPosition[],
  doorwayEnds: readonly SignedPosition[],
  pairValue: (glazingEnd: SignedPosition, doorwayEnd: SignedPosition) => number,
): number {
  let total = 0
  for (const glazingEnd of glazingEnds) {
    for (const doorwayEnd of doorwayEnds) {
      total += glazingEnd.sign * (doorwayEnd.sign * pairValue(glazingEnd, doorwayEnd))
    }
  }
  return total
}

function faceEachOther(doorway: UprightRectangle, glazing: UprightRectangle): boolean {
  return dot(doorway.facing, glazing.facing) <= ORIENTATION_TOLERANCE - 1
}

function rectangleArea(rectangle: UprightRectangle): number {
  return distance(rectangle.span[0], rectangle.span[1]) * (rectangle.head - rectangle.sill)
}

/** The exchange area, in square millimetres, between two walls that face each other; 0 otherwise. */
function facingWallsExchangeArea(doorway: UprightRectangle, glazing: UprightRectangle): number {
  const gap = dot(subtract(doorway.span[0], glazing.span[0]), glazing.facing)
  if (!faceEachOther(doorway, glazing) || gap <= 0) return 0
  const wallDirection = leftPerp(glazing.facing)
  const terms = heightTerms(doorway, glazing)
  return (
    0 -
    sumOverEndPairs(
      signedEnds(glazing.span, wallDirection),
      signedEnds(doorway.span, wallDirection),
      (glazingEnd, doorwayEnd) =>
        signedHeightSum(terms, (height) =>
          facingAntiderivative(glazingEnd.position - doorwayEnd.position, height, gap),
        ),
    )
  )
}

function parallelToEachOther(doorway: UprightRectangle, glazing: UprightRectangle): boolean {
  return Math.abs(dot(doorway.facing, glazing.facing)) >= 1 - ORIENTATION_TOLERANCE
}

function squareToEachOther(doorway: UprightRectangle, glazing: UprightRectangle): boolean {
  return Math.abs(dot(doorway.facing, glazing.facing)) <= ORIENTATION_TOLERANCE
}

/** The ends of a span, each at its distance in front of the plane of a rectangle, cut off at 0. */
function distancesInFront(
  span: readonly [Point, Point],
  plane: UprightRectangle,
): SignedPosition[] {
  const planeOffset = dot(plane.span[0], plane.facing)
  return signedEnds(span, plane.facing).map(({ position, sign }) => ({
    position: Math.max(position - planeOffset, 0),
    sign,
  }))
}

/** The exchange area, in square millimetres, between two walls at a right angle. */
function rightAngleExchangeArea(doorway: UprightRectangle, glazing: UprightRectangle): number {
  const terms = heightTerms(doorway, glazing)
  return sumOverEndPairs(
    distancesInFront(glazing.span, doorway),
    distancesInFront(doorway.span, glazing),
    (glazingEnd, doorwayEnd) =>
      signedHeightSum(terms, (height) =>
        rightAngleAntiderivative(glazingEnd.position ** 2 + doorwayEnd.position ** 2, height),
      ),
  )
}

/** The height integral of the exchange kernel at a plan distance r, in millimetres to the power -2. */
function heightKernel(terms: readonly HeightTerm[], planDistance: number): number {
  return signedHeightSum(
    terms,
    (height) =>
      (height * Math.atan(height / planDistance)) /
      (2 * planDistance * planDistance * planDistance),
  )
}

/** The exchange area, in square millimetres, between two walls at any other angle, by quadrature. */
function angledExchangeArea(doorway: UprightRectangle, glazing: UprightRectangle): number {
  const terms = heightTerms(doorway, glazing)
  const glazingLength = distance(glazing.span[0], glazing.span[1])
  const doorwayLength = distance(doorway.span[0], doorway.span[1])
  const glazingDirection = unit(subtract(glazing.span[1], glazing.span[0]))
  const doorwayDirection = unit(subtract(doorway.span[1], doorway.span[0]))
  let total = 0
  for (const glazingPoint of QUADRATURE_POINTS) {
    for (const doorwayPoint of QUADRATURE_POINTS) {
      const offset = subtract(
        shift(doorway.span[0], doorwayDirection, doorwayPoint.position * doorwayLength),
        shift(glazing.span[0], glazingDirection, glazingPoint.position * glazingLength),
      )
      total +=
        glazingPoint.weight *
        doorwayPoint.weight *
        Math.max(0, dot(glazing.facing, offset)) *
        Math.max(0, -dot(doorway.facing, offset)) *
        heightKernel(terms, Math.hypot(offset.x, offset.y))
    }
  }
  return (glazingLength * doorwayLength * total) / Math.PI
}

/** Pairs where either rectangle faces away from the other, or that face the same way, give 0. */
function exchangeArea(doorway: UprightRectangle, glazing: UprightRectangle): number {
  if (squareToEachOther(doorway, glazing)) return rightAngleExchangeArea(doorway, glazing)
  if (parallelToEachOther(doorway, glazing)) return facingWallsExchangeArea(doorway, glazing)
  return angledExchangeArea(doorway, glazing)
}

/**
 * The form factor from the doorway to the glazing, over only the point pairs where the glazing point
 * is higher than the doorway point; the doorway's area times it is the exchange area that carries
 * window light downward onto the doorway.
 */
export function doorwayToGlazingFormFactor(
  doorway: UprightRectangle,
  glazing: UprightRectangle,
): number {
  return exchangeArea(doorway, glazing) / rectangleArea(doorway)
}
