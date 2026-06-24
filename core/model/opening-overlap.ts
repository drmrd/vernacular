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
  const candidateStart = opening.position - half
  const candidateEnd = opening.position + half

  let minCenter = -Infinity
  let maxCenter = Infinity
  for (const other of others) {
    if (other.id === opening.id || other.hostWallId !== opening.hostWallId) continue
    const otherHalf = other.width / HALF
    const neighborStart = other.position - otherHalf
    const neighborEnd = other.position + otherHalf
    if (neighborEnd <= candidateStart) minCenter = Math.max(minCenter, neighborEnd + half)
    else if (neighborStart >= candidateEnd) maxCenter = Math.min(maxCenter, neighborStart - half)
  }

  if (minCenter > maxCenter) return opening.position
  return Math.min(Math.max(targetPosition, minCenter), maxCenter)
}
