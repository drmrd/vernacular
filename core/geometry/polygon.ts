import type { Point } from '../model/types'

/** Cross products below this magnitude treat two edge directions as parallel. */
const PARALLEL_EPSILON = 1e-9

/** Squared edge lengths below this mark an effectively zero-length edge. */
const DEGENERATE_EDGE_EPSILON = 1e-9

/** Fewer vertices than this cannot bound an area, so they pass through unchanged. */
const MINIMUM_POLYGON_VERTICES = 3

/** An infinite line expressed as a point on it and a (non-unit) direction. */
interface Line {
  point: Point
  dir: Point
}

/**
 * Signed area of a polygon by the shoelace formula, in squared millimeters.
 * Positive for counter-clockwise winding, negative for clockwise.
 */
export function polygonArea(points: readonly Point[]): number {
  if (points.length === 0) return 0
  let sum = 0
  for (const [index, current] of points.entries()) {
    // points is non-empty (guarded above), so the wrap-around index is always
    // in bounds; the ?? only satisfies noUncheckedIndexedAccess and never runs.
    const next = points[(index + 1) % points.length] ?? current
    sum += current.x * next.y - next.x * current.y
  }
  return sum / 2
}

/** Arithmetic mean of the polygon vertices; the empty polygon yields the origin. */
export function polygonCentroid(polygon: readonly Point[]): Point {
  if (polygon.length === 0) {
    return { x: 0, y: 0 }
  }
  const sum = polygon.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), {
    x: 0,
    y: 0,
  })
  return { x: sum.x / polygon.length, y: sum.y / polygon.length }
}

/** True when `point` lies on the segment from `a` to `b` (collinear and within the span). */
function pointOnEdge(point: Point, a: Point, b: Point): boolean {
  const cross = (point.x - a.x) * (b.y - a.y) - (point.y - a.y) * (b.x - a.x)
  if (cross !== 0) {
    return false
  }
  const withinX = point.x >= Math.min(a.x, b.x) && point.x <= Math.max(a.x, b.x)
  const withinY = point.y >= Math.min(a.y, b.y) && point.y <= Math.max(a.y, b.y)
  return withinX && withinY
}

/**
 * Even-odd ray-casting test handling convex and non-convex polygons.
 *
 * Boundary rule: a point on an edge or vertex counts as inside. The crossing
 * loop uses a half-open edge convention (`a.y <= point.y < b.y` or its mirror),
 * so vertices are counted exactly once; the explicit on-edge check makes the
 * documented inclusive boundary deterministic rather than incidental.
 */
export function pointInPolygon(point: Point, polygon: readonly Point[]): boolean {
  let inside = false
  for (const [index, current] of polygon.entries()) {
    const previous = polygon[(index + polygon.length - 1) % polygon.length] ?? current
    if (pointOnEdge(point, previous, current)) {
      return true
    }
    const crossesRay = current.y > point.y !== previous.y > point.y
    if (crossesRay) {
      const intersectX =
        ((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y) + current.x
      if (point.x < intersectX) {
        inside = !inside
      }
    }
  }
  return inside
}

/**
 * Intersection of two infinite lines, or null when their directions are
 * parallel. Solves `lineA.point + t * lineA.dir == lineB.point + s * lineB.dir`.
 */
function intersectLines(lineA: Line, lineB: Line): Point | null {
  const denominator = lineA.dir.x * lineB.dir.y - lineA.dir.y * lineB.dir.x
  if (Math.abs(denominator) < PARALLEL_EPSILON) return null

  const offsetX = lineB.point.x - lineA.point.x
  const offsetY = lineB.point.y - lineA.point.y
  const t = (offsetX * lineB.dir.y - offsetY * lineB.dir.x) / denominator

  return { x: lineA.point.x + t * lineA.dir.x, y: lineA.point.y + t * lineA.dir.y }
}

/**
 * The shifted line for edge `index`: the edge direction, and a point on the edge
 * moved inward by `offset` along the inward unit normal. `inwardSign` is +1 for a
 * counter-clockwise polygon (interior to the left of each edge) and -1 otherwise.
 * A zero-length edge falls back to the previous vertex's direction.
 */
function shiftedEdgeLine(
  polygon: Point[],
  edgeOffsets: number[],
  context: { index: number; inwardSign: number },
): Line {
  const { index, inwardSign } = context
  const count = polygon.length
  // insetPolygon only calls this with count >= MINIMUM_POLYGON_VERTICES, so the
  // indexed lookups below are always in bounds; the ?? fallbacks exist solely to
  // satisfy noUncheckedIndexedAccess and never run.
  const start = polygon[index] ?? polygon[0]!
  const end = polygon[(index + 1) % count] ?? start
  let dx = end.x - start.x
  let dy = end.y - start.y
  if (dx * dx + dy * dy < DEGENERATE_EDGE_EPSILON) {
    const previous = polygon[(index + count - 1) % count] ?? start
    dx = start.x - previous.x
    dy = start.y - previous.y
  }
  // The `|| 1` is a best-effort guard for the second degenerate case: when the
  // edge and its predecessor share an endpoint (two identical adjacent vertices),
  // both fallbacks yield a zero-length direction and `|| 1` avoids dividing by 0.
  const length = Math.hypot(dx, dy) || 1
  const inwardX = (inwardSign * -dy) / length
  const inwardY = (inwardSign * dx) / length
  const offset = edgeOffsets[index] ?? 0
  return {
    point: { x: start.x + offset * inwardX, y: start.y + offset * inwardY },
    dir: { x: dx, y: dy },
  }
}

/**
 * Each edge `i` (vertex `i` -> vertex `i+1`) is shifted inward by
 * `edgeOffsets[i]`; corners are the intersections of adjacent shifted-edge lines.
 * The winding is normalized via the shoelace sign so a clockwise input insets
 * inward too, with offsets staying aligned to edge indices. Parallel adjacent
 * edges keep the corner on their common shifted line. Best-effort on
 * self-intersection from over-inset.
 */
export function insetPolygon(polygon: Point[], edgeOffsets: number[]): Point[] {
  const count = polygon.length
  if (count < MINIMUM_POLYGON_VERTICES) return [...polygon]

  const inwardSign = polygonArea(polygon) >= 0 ? 1 : -1
  const lines = polygon.map((_, index) =>
    shiftedEdgeLine(polygon, edgeOffsets, { index, inwardSign }),
  )

  return lines.map((current, index) => {
    const previous = lines[(index + count - 1) % count]!
    return intersectLines(previous, current) ?? current.point
  })
}
