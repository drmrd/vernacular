import { distance } from '../geometry/point'
import type { Opening, Point, Wall } from '../model/types'

/** Resolved plan geometry of an opening against its host wall. */
export interface OpeningGeometry {
  /** Center point of the opening, on the host wall centerline. */
  center: Point
  /** Unit vector along the host wall, from start to end. */
  along: Point
  /** Unit left-hand normal of `along`. */
  normal: Point
  /** The effective (clamped) width, in millimeters. */
  width: number
  /** Jamb point at `center - along * width / 2`. */
  jambStart: Point
  /** Jamb point at `center + along * width / 2`. */
  jambEnd: Point
}

/** Add two points componentwise. */
function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y }
}

/** Scale a point by a scalar factor. */
function scale(point: Point, factor: number): Point {
  return { x: point.x * factor, y: point.y * factor }
}

/**
 * Resolve the opening's plan geometry against its host wall, clamping the center
 * so the opening stays on the wall. A zero-length host wall yields a degenerate
 * geometry at the wall start rather than NaN coordinates.
 */
export function deriveOpeningGeometry(opening: Opening, hostWall: Wall): OpeningGeometry {
  const length = distance(hostWall.start, hostWall.end)
  if (length === 0) {
    return {
      center: hostWall.start,
      along: { x: 1, y: 0 },
      normal: { x: 0, y: 1 },
      width: 0,
      jambStart: hostWall.start,
      jambEnd: hostWall.start,
    }
  }

  const along: Point = {
    x: (hostWall.end.x - hostWall.start.x) / length,
    y: (hostWall.end.y - hostWall.start.y) / length,
  }
  // Adding zero normalizes negative zero to positive zero so structural equality
  // checks on axis-aligned normals hold.
  const normal: Point = { x: -along.y + 0, y: along.x }

  const effectiveWidth = Math.min(opening.width, length)
  const half = effectiveWidth / 2
  const clampedPosition = Math.max(half, Math.min(opening.position, length - half))

  const center = add(hostWall.start, scale(along, clampedPosition))
  const jambStart = add(center, scale(along, -half))
  const jambEnd = add(center, scale(along, half))

  return { center, along, normal, width: effectiveWidth, jambStart, jambEnd }
}

/**
 * The four footprint corners (width along the wall by `thickness` across), centered on `center`.
 *
 * The five parameters (center, along and normal axes, width and thickness extents) are the
 * natural signature for a wall-aligned planar rectangle and are kept rather than bundled.
 */
// eslint-disable-next-line max-params -- center plus the along/normal axes plus the width and thickness extents is the natural signature for a wall-aligned rectangle footprint
export function openingFootprint(
  center: Point,
  along: Point,
  normal: Point,
  width: number,
  thickness: number,
): [Point, Point, Point, Point] {
  const halfWidth = width / 2
  const halfThickness = thickness / 2
  return [
    add(add(center, scale(along, -halfWidth)), scale(normal, -halfThickness)),
    add(add(center, scale(along, halfWidth)), scale(normal, -halfThickness)),
    add(add(center, scale(along, halfWidth)), scale(normal, halfThickness)),
    add(add(center, scale(along, -halfWidth)), scale(normal, halfThickness)),
  ]
}
