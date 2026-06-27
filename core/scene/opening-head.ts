import { distance } from '../geometry/point'
import type { Point } from '../model/types'
import type { VoidContourKind } from '../registries/element-types'

/**
 * One circular arc of an opening's plan head, in the opening-local frame: the
 * x-axis runs along the wall (jamb to jamb) and the y-axis rises across the wall
 * toward the opening's facing side. The arc is the portion of the circle centered
 * at `center`, from `from` to `to`, that passes through `crown` (the head's
 * highest point on the +y side). The drawing layer maps these points onto the
 * wall axes and projects them, so this stays free of any screen or canvas concern.
 */
export interface OpeningHeadArc {
  center: Point
  from: Point
  to: Point
  crown: Point
}

/** Crown rise of a segmental arch as a fraction of the half-width, shallower than a semicircle's full half-width rise. */
const SEGMENTAL_RISE_FRACTION = 0.5

/**
 * A single circular arc springing from both jambs to a crown `rise` above the
 * springline. The center sits on the centerline at the y that makes the jambs and
 * the crown share one radius: a semicircle (`rise == halfWidth`) centers on the
 * springline, while a shallower segmental arch (`rise < halfWidth`) drops it below.
 */
function onAxisArc(halfWidth: number, rise: number): OpeningHeadArc {
  const centerY = (rise * rise - halfWidth * halfWidth) / (2 * rise)
  return {
    center: { x: 0, y: centerY },
    from: { x: -halfWidth, y: 0 },
    to: { x: halfWidth, y: 0 },
    crown: { x: 0, y: rise },
  }
}

/** The midpoint of an arc's minor (visible) span: the point on the circle along the bisector of its two endpoints. */
function arcCrown(center: Point, from: Point, to: Point): Point {
  const radius = distance(center, from)
  const sumX = (from.x - center.x + (to.x - center.x)) / radius
  const sumY = (from.y - center.y + (to.y - center.y)) / radius
  const bisectorLength = Math.hypot(sumX, sumY)
  return {
    x: center.x + (radius * sumX) / bisectorLength,
    y: center.y + (radius * sumY) / bisectorLength,
  }
}

/** One side of a pointed (lancet) arch: a circular arc centered on the far jamb, springing from the near jamb up to the apex. */
function lancetArc(center: Point, spring: Point, apex: Point): OpeningHeadArc {
  return { center, from: spring, to: apex, crown: arcCrown(center, spring, apex) }
}

/**
 * A pointed head: two equilateral arcs, each centered on the far jamb with a
 * radius equal to the full width, meeting at an apex above the springline.
 */
function lancetArcs(halfWidth: number): OpeningHeadArc[] {
  const span = halfWidth * 2
  const apex: Point = { x: 0, y: Math.sqrt(span * span - halfWidth * halfWidth) }
  const leftSpring: Point = { x: -halfWidth, y: 0 }
  const rightSpring: Point = { x: halfWidth, y: 0 }
  return [lancetArc(rightSpring, leftSpring, apex), lancetArc(leftSpring, rightSpring, apex)]
}

/**
 * The plan head arcs resolved from an opening's shape parameter
 * (`scene3D.voidContour`), in the opening-local frame described on
 * {@link OpeningHeadArc}. A rectangular (flat) head yields no arcs, so a new
 * curved shape is a new `case`, not a change in the drawing routine that calls
 * this, mirroring `openingVoidContour` (foundation spec 3.1).
 */
export function openingHeadArcs(
  shape: VoidContourKind | undefined,
  width: number,
): OpeningHeadArc[] {
  const halfWidth = width / 2
  switch (shape) {
    case 'round':
      // A semicircle is the on-axis arc whose rise equals the half-width.
      return [onAxisArc(halfWidth, halfWidth)]
    case 'arched':
      return [onAxisArc(halfWidth, halfWidth * SEGMENTAL_RISE_FRACTION)]
    case 'lancet':
      return lancetArcs(halfWidth)
    default:
      return []
  }
}
