import { describe, expect, it } from 'vitest'
import { createOpening } from './factories'
import { openingWouldOverlap } from './opening-overlap'
import type { Opening } from './types'

// Build a full Opening from just the fields the overlap predicate cares about
// (id, host wall, center position, width); createOpening fills the rest with
// defaults so the test stays independent of unrelated opening fields.
function opening(fields: {
  id: string
  hostWallId: string
  position: number
  width: number
}): Opening {
  return createOpening({ type: 'door', ...fields })
}

describe('openingWouldOverlap', () => {
  it('reports overlap only for distinct, same-wall openings whose spans strictly overlap', () => {
    // Candidate occupies [900, 1100] on wall A (center 1000, width 200).
    const candidate = opening({ id: 'candidate', hostWallId: 'wall-a', position: 1000, width: 200 })

    // Overlapping: [950, 1050] sits inside the candidate span on the same wall.
    const overlapping = opening({
      id: 'overlapping',
      hostWallId: 'wall-a',
      position: 1000,
      width: 100,
    })
    expect(openingWouldOverlap(candidate, [overlapping])).toBe(true)

    // Disjoint: [1400, 1600] does not touch the candidate span on the same wall.
    const disjoint = opening({ id: 'disjoint', hostWallId: 'wall-a', position: 1500, width: 200 })
    expect(openingWouldOverlap(candidate, [disjoint])).toBe(false)

    // Touching at an endpoint: [700, 900] meets the candidate span exactly at 900.
    const touching = opening({ id: 'touching', hostWallId: 'wall-a', position: 800, width: 200 })
    expect(openingWouldOverlap(candidate, [touching])).toBe(false)

    // Different wall: same position range but a different host wall does not overlap.
    const otherWall = opening({
      id: 'other-wall',
      hostWallId: 'wall-b',
      position: 1000,
      width: 200,
    })
    expect(openingWouldOverlap(candidate, [otherWall])).toBe(false)

    // Itself: an opening compared against a list containing its own id never overlaps.
    expect(openingWouldOverlap(candidate, [candidate])).toBe(false)
  })
})
