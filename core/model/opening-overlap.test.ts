import { describe, expect, it } from 'vitest'
import { createOpening } from './factories'
import {
  clampOpeningMove,
  clampOpeningResizeJamb,
  clampOpeningWidth,
  openingWouldOverlap,
} from './opening-overlap'
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

describe('clampOpeningMove', () => {
  it('clamps a move flush against the nearest blocking same-wall neighbor and ignores clear or off-wall openings', () => {
    // Candidate occupies [900, 1100] on wall A (center 1000, width 200). With a
    // width-200 neighbor centered at 1500 on its right ([1400, 1600]) and a
    // width-200 neighbor centered at 500 on its left ([400, 600]), the maximal
    // overlap-free interval for the candidate center is [700, 1300]: it can slide
    // until its span touches a neighbor (touching is allowed) but no further.
    const candidate = opening({ id: 'candidate', hostWallId: 'wall-a', position: 1000, width: 200 })
    const rightNeighbor = opening({ id: 'right', hostWallId: 'wall-a', position: 1500, width: 200 })
    const leftNeighbor = opening({ id: 'left', hostWallId: 'wall-a', position: 500, width: 200 })
    const others = [rightNeighbor, leftNeighbor]

    // (a) A target that keeps the candidate clear is returned unchanged.
    expect(clampOpeningMove(candidate, 1200, others)).toBe(1200)

    // (b) A target past the right neighbor clamps flush: center at 1500 - 200 = 1300.
    expect(clampOpeningMove(candidate, 1450, others)).toBe(1300)

    // (c) A target past the left neighbor clamps flush: center at 500 + 200 = 700.
    expect(clampOpeningMove(candidate, 650, others)).toBe(700)

    // (d) A blocking-looking neighbor on a different wall does not constrain.
    const offWall = opening({ id: 'off-wall', hostWallId: 'wall-b', position: 1500, width: 200 })
    expect(clampOpeningMove(candidate, 1450, [offWall])).toBe(1450)
  })
})

describe('clampOpeningWidth', () => {
  it('widens up to the nearest same-wall neighbor while staying centered, taking the smaller side gap', () => {
    // Candidate stays centered at 1000 throughout; width is what we clamp.
    const candidate = opening({ id: 'candidate', hostWallId: 'wall-a', position: 1000, width: 200 })

    // (a) With only a same-wall neighbor too distant to constrain the target, the
    // target width is returned unchanged.
    const clearRight = opening({
      id: 'clear-right',
      hostWallId: 'wall-a',
      position: 3000,
      width: 200,
    })
    expect(clampOpeningWidth(candidate, 1400, [clearRight])).toBe(1400)

    // (b) A width-200 neighbor centered at 1600 has near edge 1500, so from the
    // fixed center 1000 the half-width is capped at 500 and the max width is 1000.
    // A target of 1400 clamps to 1000.
    const rightNeighbor = opening({ id: 'right', hostWallId: 'wall-a', position: 1600, width: 200 })
    expect(clampOpeningWidth(candidate, 1400, [rightNeighbor])).toBe(1000)

    // (c) With neighbors on both sides, the smaller side gap wins. The right
    // neighbor's near edge is 1500 (gap 500); a left neighbor width 200 centered
    // at 650 has near edge 750 (gap 250 from center 1000), so the half-width is
    // capped at 250 and the max width is 500. A target of 1400 clamps to 500.
    const leftNeighbor = opening({ id: 'left', hostWallId: 'wall-a', position: 650, width: 200 })
    expect(clampOpeningWidth(candidate, 1400, [rightNeighbor, leftNeighbor])).toBe(500)

    // (d) A blocking-looking neighbor on a different wall does not constrain, so a
    // target of 1400 is returned unchanged.
    const offWall = opening({ id: 'off-wall', hostWallId: 'wall-b', position: 1600, width: 200 })
    expect(clampOpeningWidth(candidate, 1400, [offWall])).toBe(1400)
  })
})

describe('clampOpeningResizeJamb', () => {
  it('clamps a dragged jamb to the nearest blocking same-wall neighbor and ignores clear or off-wall openings', () => {
    // Opening occupies [900, 1100] on wall A (center 1000, width 200). During a
    // jamb-drag resize one jamb moves while the opposite jamb stays fixed.
    const target = opening({ id: 'target', hostWallId: 'wall-a', position: 1000, width: 200 })

    // (a) Dragging the 'end' (higher) jamb is bounded on the right by the near edge
    // of the nearest neighbor beyond the current far edge. A width-200 neighbor
    // centered at 1600 has near edge 1500, so a dragged 'end' jamb of 1700 clamps to
    // 1500, while a dragged 'end' jamb of 1300 (clear of the neighbor) stays 1300.
    const rightNeighbor = opening({ id: 'right', hostWallId: 'wall-a', position: 1600, width: 200 })
    expect(clampOpeningResizeJamb(target, 'end', 1700, [rightNeighbor])).toBe(1500)
    expect(clampOpeningResizeJamb(target, 'end', 1300, [rightNeighbor])).toBe(1300)

    // (b) Dragging the 'start' (lower) jamb is bounded on the left by the far edge
    // of the nearest neighbor before the current near edge. A width-200 neighbor
    // centered at 400 has far edge 500, so a dragged 'start' jamb of 300 clamps to 500.
    const leftNeighbor = opening({ id: 'left', hostWallId: 'wall-a', position: 400, width: 200 })
    expect(clampOpeningResizeJamb(target, 'start', 300, [leftNeighbor])).toBe(500)

    // (c) With no same-wall neighbor on the dragged side, the dragged jamb is
    // returned unchanged.
    expect(clampOpeningResizeJamb(target, 'end', 1700, [leftNeighbor])).toBe(1700)

    // (d) A blocking-looking neighbor on a different wall does not constrain, so the
    // dragged jamb is returned unchanged.
    const offWall = opening({ id: 'off-wall', hostWallId: 'wall-b', position: 1600, width: 200 })
    expect(clampOpeningResizeJamb(target, 'end', 1700, [offWall])).toBe(1700)
  })
})
