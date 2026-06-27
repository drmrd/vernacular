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

/** A semicircular head: the circle centered on the springline midpoint, rising a half-width to its crown. */
function roundHead(halfWidth: number): OpeningHeadArc {
  return {
    center: { x: 0, y: 0 },
    from: { x: -halfWidth, y: 0 },
    to: { x: halfWidth, y: 0 },
    crown: { x: 0, y: halfWidth },
  }
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
      return [roundHead(halfWidth)]
    default:
      return []
  }
}
