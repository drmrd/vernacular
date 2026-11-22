import { distance } from '../geometry/point'
import { dot, leftPerp, subtract } from '../geometry/vector'
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

/** How far a dot product of unit normals may sit from -1 or 0 and still count as facing or square. */
const ORIENTATION_TOLERANCE = 1e-9

const LOGARITHM_DIVISOR = 4

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
  const squaredSum = squaredReach + height * height
  if (squaredSum === 0) return 0
  const reach = Math.sqrt(squaredReach)
  return (
    (-height * reach * Math.atan2(height, reach) +
      ((squaredReach - height * height) * Math.log(squaredSum)) / LOGARITHM_DIVISOR) /
    (2 * Math.PI)
  )
}

function signedHeightSum(terms: readonly HeightTerm[], kernel: (height: number) => number): number {
  return terms.reduce((sum, term) => sum + term.sign * kernel(term.height), 0)
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
  let exchangeArea = 0
  for (const glazingEnd of signedEnds(glazing.span, wallDirection)) {
    for (const doorwayEnd of signedEnds(doorway.span, wallDirection)) {
      const offset = glazingEnd.position - doorwayEnd.position
      const signedSum = signedHeightSum(terms, (height) =>
        facingAntiderivative(offset, height, gap),
      )
      exchangeArea -= glazingEnd.sign * doorwayEnd.sign * signedSum
    }
  }
  return exchangeArea
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
  let exchangeArea = 0
  for (const glazingEnd of distancesInFront(glazing.span, doorway)) {
    for (const doorwayEnd of distancesInFront(doorway.span, glazing)) {
      const squaredReach = glazingEnd.position ** 2 + doorwayEnd.position ** 2
      const signedSum = signedHeightSum(terms, (height) =>
        rightAngleAntiderivative(squaredReach, height),
      )
      exchangeArea += glazingEnd.sign * doorwayEnd.sign * signedSum
    }
  }
  return exchangeArea
}

/**
 * The form factor from the doorway to the glazing, over only the point pairs where the glazing point
 * is higher than the doorway point; the doorway's area times it is the exchange area that carries
 * window light downward onto the doorway. Walls that neither face each other nor meet at a right
 * angle give 0.
 */
export function doorwayToGlazingFormFactor(
  doorway: UprightRectangle,
  glazing: UprightRectangle,
): number {
  const exchangeArea = squareToEachOther(doorway, glazing)
    ? rightAngleExchangeArea(doorway, glazing)
    : facingWallsExchangeArea(doorway, glazing)
  return exchangeArea / rectangleArea(doorway)
}
