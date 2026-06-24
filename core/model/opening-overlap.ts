import type { Opening } from './types'

// An opening's along-wall span is centered on `position`, so each half-span is
// width / HALF. Naming the divisor keeps the no-magic-numbers rule quiet.
const HALF = 2

/**
 * Whether placing `candidate` would overlap an existing opening on the same host
 * wall. An opening occupies the along-wall span `[position - width / 2, position
 * + width / 2]` (millimeters from the wall start). Two spans that merely touch at
 * an endpoint do not overlap; only a strict overlap counts. The candidate is
 * never compared against itself, so re-placing an opening at its own location is
 * not a self-overlap.
 */
export function openingWouldOverlap(candidate: Opening, existing: readonly Opening[]): boolean {
  return existing.some(
    (other) =>
      other.id !== candidate.id &&
      other.hostWallId === candidate.hostWallId &&
      Math.abs(other.position - candidate.position) < (other.width + candidate.width) / HALF,
  )
}

/**
 * The raw jamb-coordinate bounds the opening's current span imposes from its
 * same-wall neighbors. `leftLimit` is the far edge of the nearest neighbor whose
 * far edge sits at or before the opening's near edge (default `-Infinity`);
 * `rightLimit` is the near edge of the nearest neighbor whose near edge sits at
 * or after the opening's far edge (default `+Infinity`).
 *
 * Neighbors on a different host wall and the opening itself are skipped. A
 * neighbor that already overlaps the opening's current span sits to neither
 * side, so it contributes no bound; this keeps a pre-existing overlap from
 * spuriously trapping the opening.
 */
function neighborEdgeLimits(
  opening: Opening,
  others: readonly Opening[],
): { leftLimit: number; rightLimit: number } {
  const half = opening.width / HALF
  const candidateStart = opening.position - half
  const candidateEnd = opening.position + half

  let leftLimit = -Infinity
  let rightLimit = Infinity
  for (const other of others) {
    if (other.id === opening.id || other.hostWallId !== opening.hostWallId) continue
    const neighborHalf = other.width / HALF
    const neighborStart = other.position - neighborHalf
    const neighborEnd = other.position + neighborHalf
    if (neighborEnd <= candidateStart) leftLimit = Math.max(leftLimit, neighborEnd)
    else if (neighborStart >= candidateEnd) rightLimit = Math.min(rightLimit, neighborStart)
  }

  return { leftLimit, rightLimit }
}

/**
 * The along-wall coordinate to move `opening` to. If moving to `targetPosition`
 * keeps the opening's span clear of every same-wall neighbor, the target is
 * returned unchanged. Otherwise the target is clamped into the maximal
 * overlap-free interval that contains the opening's current position, sliding
 * flush against the blocking neighbor (touching is allowed) but no further.
 *
 * Neighbors on a different host wall and the opening itself never constrain the
 * move. By design, a neighbor that already overlaps the opening's current span
 * is also ignored: it sits to neither the left nor the right of the current
 * span, so it contributes no bound. This keeps an invalid pre-existing overlap
 * from spuriously trapping the opening.
 *
 * If the allowed interval is empty (`minCenter > maxCenter`), the input is
 * already inside a pre-existing overlap and has no valid position to clamp to;
 * the opening's current `position` is returned unchanged.
 */
export function clampOpeningMove(
  opening: Opening,
  targetPosition: number,
  others: readonly Opening[],
): number {
  const half = opening.width / HALF
  const { leftLimit, rightLimit } = neighborEdgeLimits(opening, others)
  const minCenter = leftLimit + half
  const maxCenter = rightLimit - half

  if (minCenter > maxCenter) return opening.position
  return Math.min(Math.max(targetPosition, minCenter), maxCenter)
}

/**
 * The width to resize `opening` to, kept centered on its current `position`. The
 * opening grows symmetrically until its near edge meets the closest same-wall
 * neighbor on either side (touching is allowed), and never beyond
 * `targetWidth`. The smaller of the two side gaps bounds the half-width, so the
 * centered span stays clear of every neighbor.
 *
 * Neighbors on a different host wall and the opening itself never constrain the
 * width. With no same-wall neighbor, the side gaps are unbounded and
 * `targetWidth` is returned unchanged.
 *
 * If a same-wall neighbor already overlaps the opening's current span, the side
 * gap to it is negative and the bounding half-width drops to `<= 0`. There is no
 * valid centered width to clamp to in that case, so the opening's current
 * `width` is returned unchanged.
 */
export function clampOpeningWidth(
  opening: Opening,
  targetWidth: number,
  others: readonly Opening[],
): number {
  let maxHalfWidth = Infinity
  for (const other of others) {
    if (other.id === opening.id || other.hostWallId !== opening.hostWallId) continue
    const otherHalf = other.width / HALF
    // Distance from the fixed center to the neighbor's near edge, on whichever
    // side the neighbor sits. Negative when the neighbor already overlaps.
    const sideGap = Math.abs(other.position - opening.position) - otherHalf
    maxHalfWidth = Math.min(maxHalfWidth, sideGap)
  }

  if (maxHalfWidth <= 0) return opening.width
  return Math.min(targetWidth, maxHalfWidth * HALF)
}

/**
 * The clamped coordinate for a dragged jamb during a resize. One jamb moves to
 * `draggedJamb` while the other stays fixed; `edge` names the dragged jamb
 * (`'start'` is the lower-coordinate jamb, `'end'` is the higher). The returned
 * coordinate keeps the resized span from strictly overlapping a same-wall
 * neighbor (touching is allowed).
 *
 * A dragged `'end'` jamb is bounded above by the near edge of the closest
 * neighbor sitting beyond the opening's far edge; a dragged `'start'` jamb is
 * bounded below by the far edge of the closest neighbor sitting before the
 * opening's near edge. Neighbors on a different host wall and the opening itself
 * never constrain the drag.
 */
// eslint-disable-next-line max-params -- the opening, which jamb is dragged, its proposed coordinate, and the neighbors is the natural signature for clamping one resize jamb
export function clampOpeningResizeJamb(
  opening: Opening,
  edge: 'start' | 'end',
  draggedJamb: number,
  others: readonly Opening[],
): number {
  const { leftLimit, rightLimit } = neighborEdgeLimits(opening, others)

  if (edge === 'end') return Math.min(draggedJamb, rightLimit)
  return Math.max(draggedJamb, leftLimit)
}
