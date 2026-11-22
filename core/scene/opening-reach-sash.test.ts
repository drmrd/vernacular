import { describe, expect, it } from 'vitest'

import type { OpeningPose } from './opening-pose'
import { openingUnderReach } from './opening-reach'
import {
  REACH_MM,
  doorAtZ2000,
  eyeFacingDoor,
  hungWindowAtZ2000,
  towardDoor,
} from './opening-reach-test-support'
import type { OpeningSceneNode } from './scene-graph'

const WINDOW_ID = 'opening:hung-window'
// The meeting rail's top sits 630mm above the sill, so 1530mm above the floor for this window.
const RAIL_TOP_MM = 630
const JUST_ABOVE_RAIL_Y = 1531
const ON_RAIL_TOP_Y = 1530
const IN_TOP_GAP_Y = 2050
const IN_BOTTOM_GAP_Y = 1100

function hitAt(
  eyeY: number,
  options: { window?: OpeningSceneNode; openness?: ReadonlyMap<string, OpeningPose> } = {},
) {
  const window = options.window ?? hungWindowAtZ2000(WINDOW_ID)
  return openingUnderReach({ ...eyeFacingDoor, y: eyeY }, towardDoor, [window], {
    openness: options.openness ?? new Map(),
    reachMm: REACH_MM,
  })
}

describe('openingUnderReach on a hung window', () => {
  it('picks the upper sash for a hit above the meeting rail', () => {
    const window = hungWindowAtZ2000(WINDOW_ID)

    const hit = hitAt(JUST_ABOVE_RAIL_Y, { window })

    expect(hit?.part).toBe('upper')
    expect(hit?.band).toEqual({ bottomMm: RAIL_TOP_MM, topMm: window.height })
    expect(hitAt(IN_TOP_GAP_Y)?.part).toBe('upper')
  })

  it('picks the lower sash for a hit on the top of the meeting rail', () => {
    const hit = hitAt(ON_RAIL_TOP_Y)

    expect(hit?.part).toBe('lower')
    expect(hit?.band).toEqual({ bottomMm: 0, topMm: RAIL_TOP_MM })
    expect(hitAt(IN_BOTTOM_GAP_Y)?.part).toBe('lower')
  })

  it('picks the upper sash for a straight look at standing eye height', () => {
    // The walker's eye is above the rail top, so a straight look lowers the upper sash;
    // the walker looks lower to raise the lower sash.
    const hit = openingUnderReach(eyeFacingDoor, towardDoor, [hungWindowAtZ2000(WINDOW_ID)], {
      reachMm: REACH_MM,
    })

    expect(hit?.part).toBe('upper')
  })

  it('picks the lower sash anywhere on a single-hung window', () => {
    const singleHung: OpeningSceneNode = {
      ...hungWindowAtZ2000(WINDOW_ID),
      type: 'single-hung-window',
    }

    const hit = hitAt(IN_TOP_GAP_Y, { window: singleHung })

    expect(hit?.part).toBe('lower')
    expect(hit?.band).toEqual({ bottomMm: 0, topMm: singleHung.height })
  })

  it('closes the lowered upper sash when aimed at the gap it opened', () => {
    const upperOpen = new Map([[WINDOW_ID, { upper: 1 }]])

    const hit = hitAt(IN_TOP_GAP_Y, { openness: upperOpen })

    expect(hit?.openingId).toBe(WINDOW_ID)
    expect(hit?.part).toBe('upper')
  })

  it('closes the raised lower sash when aimed at the gap it opened', () => {
    const lowerOpen = new Map([[WINDOW_ID, { lower: 1 }]])

    const hit = hitAt(IN_BOTTOM_GAP_Y, { openness: lowerOpen })

    expect(hit?.openingId).toBe(WINDOW_ID)
    expect(hit?.part).toBe('lower')
  })
})

describe('openingUnderReach on a door', () => {
  it('reports the whole frame as the band of a door', () => {
    const door = doorAtZ2000('opening:front-door')

    const hit = openingUnderReach(eyeFacingDoor, towardDoor, [door], { reachMm: REACH_MM })

    expect(hit?.part).toBe('primary')
    expect(hit?.band).toEqual({ bottomMm: 0, topMm: door.height })
  })
})
