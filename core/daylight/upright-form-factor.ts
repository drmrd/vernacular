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

/** How far a dot product of two unit normals may sit from -1 and still count as facing walls. */
const PARALLEL_TOLERANCE = 1e-9

interface SignedPosition {
  position: number
  sign: number
}

interface HeightTerm {
  height: number
  sign: number
}

function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y
}

/** The larger end of a span along a direction counts +1 and the smaller end -1. */
function signedEnds(span: readonly [Point, Point], along: Point): SignedPosition[] {
  const first = dot(span[0], along)
  const second = dot(span[1], along)
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

/** The antiderivative of the facing-walls exchange, in square millimetres. */
function facingAntiderivative(along: number, height: number, distance: number): number {
  const alongRoot = Math.sqrt(along * along + distance * distance)
  const heightRoot = Math.sqrt(height * height + distance * distance)
  return (
    (height * alongRoot * Math.atan(height / alongRoot) +
      along * heightRoot * Math.atan(along / heightRoot) -
      (distance * distance * Math.log(along * along + height * height + distance * distance)) / 2) /
    (2 * Math.PI)
  )
}

function signedHeightSum(along: number, terms: readonly HeightTerm[], distance: number): number {
  return terms.reduce(
    (sum, term) => sum + term.sign * facingAntiderivative(along, term.height, distance),
    0,
  )
}

/**
 * The share of the light that leaves the doorway's plane and reaches the glazing, counting only
 * rays that travel downward from the glazing to the doorway. Walls that do not face each other give 0.
 */
export function doorwayToGlazingFormFactor(
  doorway: UprightRectangle,
  glazing: UprightRectangle,
): number {
  const distance =
    (doorway.span[0].x - glazing.span[0].x) * glazing.facing.x +
    (doorway.span[0].y - glazing.span[0].y) * glazing.facing.y
  if (dot(doorway.facing, glazing.facing) > PARALLEL_TOLERANCE - 1 || distance <= 0) return 0
  const along = { x: -glazing.facing.y, y: glazing.facing.x }
  const terms = heightTerms(doorway, glazing)
  let exchangeArea = 0
  for (const glazingEnd of signedEnds(glazing.span, along)) {
    for (const doorwayEnd of signedEnds(doorway.span, along)) {
      const signedSum = signedHeightSum(glazingEnd.position - doorwayEnd.position, terms, distance)
      exchangeArea -= glazingEnd.sign * doorwayEnd.sign * signedSum
    }
  }
  const doorwayWidth = Math.hypot(
    doorway.span[1].x - doorway.span[0].x,
    doorway.span[1].y - doorway.span[0].y,
  )
  return exchangeArea / (doorwayWidth * (doorway.head - doorway.sill))
}
