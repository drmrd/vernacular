import type { Contour, ContourSegment, Point } from '../../core'

/**
 * Straight segments per half turn (pi radians) when flattening an arc, so a
 * semicircular head reads as a smooth curve while the sampling stays fixed and
 * deterministic (no random jitter, the same mesh every build).
 */
const ARC_SEGMENTS_PER_HALF_TURN = 16

/** Full turn in radians; an arc's signed sweep is folded into one turn around its center. */
const FULL_TURN = Math.PI * 2

/** Half turn in radians; the per-half-turn sample budget is scaled by how much of one the arc sweeps. */
const HALF_TURN = FULL_TURN / 2

/** One arc variant of {@link ContourSegment}, narrowed for the flattener. */
type ArcSegment = Extract<ContourSegment, { kind: 'arc' }>

/**
 * The signed angular displacement from the `start` angle to the `end` angle when
 * traversed in the requested direction, folded into at most one turn: negative
 * (decreasing angle) when clockwise, non-negative when not. The opening head arcs
 * never sweep past a half turn, so this is their minor arc; a future reflex arc
 * would take the directed long way round, which is the intended cut.
 */
function signedSweep(start: number, end: number, clockwise: boolean): number {
  const raw = end - start
  if (clockwise) return raw > 0 ? raw - FULL_TURN : raw
  return raw < 0 ? raw + FULL_TURN : raw
}

/**
 * Flattens one arc segment from `from` (its start corner, already in the loop)
 * into a polyline that excludes `from` and includes every interior sample and the
 * endpoint `segment.to`. The sample count scales with the swept angle so shallow
 * and full arcs both stay smooth.
 */
function arcPolyline(from: Point, segment: ArcSegment): Point[] {
  const { center, to, clockwise } = segment
  const radius = Math.hypot(from.x - center.x, from.y - center.y)
  const start = Math.atan2(from.y - center.y, from.x - center.x)
  const end = Math.atan2(to.y - center.y, to.x - center.x)
  const sweep = signedSweep(start, end, clockwise)
  const steps = Math.max(1, Math.ceil((Math.abs(sweep) / HALF_TURN) * ARC_SEGMENTS_PER_HALF_TURN))
  const points: Point[] = []
  for (let step = 1; step <= steps; step += 1) {
    const angle = start + (sweep * step) / steps
    points.push({ x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) })
  }
  return points
}

/**
 * The contour's boundary as a flat point loop in its local frame: the start
 * point, then every segment flattened in order, with arc segments sampled into
 * short chords. The implicit closing segment is dropped because the loop closes
 * back to the start. A rectangular (all-line) contour returns its corners
 * unchanged, so straight openings cut exactly as before.
 */
export function tessellateContourLoop(contour: Contour): Point[] {
  const points: Point[] = [contour.start]
  let current = contour.start
  for (const segment of contour.segments.slice(0, -1)) {
    const next = segment.kind === 'arc' ? arcPolyline(current, segment) : [segment.to]
    points.push(...next)
    current = segment.to
  }
  return points
}
