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
