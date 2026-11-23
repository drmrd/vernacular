import { describe, expect, it } from 'vitest'

import {
  emptyOpeningInteraction,
  toggleOpening,
  type OpeningInteractionState,
  type OpeningPose,
  type OpeningSceneNode,
} from '../../core'

import { settleUnshownOpenings } from './walk-interaction'

const SHOWN_DOOR_ID = 'opening:door-a'
const UNSHOWN_DOOR_ID = 'opening:door-b'

const SHUT = 0
const PART_WAY = 0.4
const FULLY_OPEN = 1

function doorWithId(id: string): OpeningSceneNode {
  return {
    id,
    kind: 'opening',
    floorId: 'g',
    type: 'single-swing-door',
    center: { x: 1000, y: 2000 },
    along: { x: 1, y: 0 },
    normal: { x: 0, y: 1 },
    width: 900,
    height: 2032,
    sillHeight: 0,
    hostThickness: 120,
    orientation: { hinge: 'start', facing: 'positive' },
    hostWallId: 'south',
  }
}

function poseAt(primary: number): OpeningPose {
  return { primary }
}

function holdingOpen(...ids: string[]): OpeningInteractionState {
  return ids.reduce(
    (state, openingId) => toggleOpening(state, { openingId, part: 'primary' }),
    emptyOpeningInteraction(),
  )
}

describe('settleUnshownOpenings', () => {
  it('shuts an unshown opening the session no longer holds open, and leaves a shown one as it is', () => {
    const openness = new Map([
      [UNSHOWN_DOOR_ID, poseAt(FULLY_OPEN)],
      [SHOWN_DOOR_ID, poseAt(FULLY_OPEN)],
    ])

    settleUnshownOpenings({
      openings: [doorWithId(SHOWN_DOOR_ID)],
      interaction: emptyOpeningInteraction(),
      openness,
    })

    expect(openness.get(UNSHOWN_DOOR_ID)?.primary).toBe(SHUT)
    expect(openness.get(SHOWN_DOOR_ID)?.primary).toBe(FULLY_OPEN)
  })

  it('opens fully an unshown opening that the session holds open and that carries a shut openness', () => {
    const openness = new Map([[UNSHOWN_DOOR_ID, poseAt(SHUT)]])

    settleUnshownOpenings({
      openings: [doorWithId(SHOWN_DOOR_ID)],
      interaction: holdingOpen(UNSHOWN_DOOR_ID),
      openness,
    })

    expect(openness.get(UNSHOWN_DOOR_ID)?.primary).toBe(FULLY_OPEN)
  })

  it('seats a part way unshown opening at its target, with no swing left to play', () => {
    const openness = new Map([[UNSHOWN_DOOR_ID, poseAt(PART_WAY)]])

    settleUnshownOpenings({
      openings: [],
      interaction: holdingOpen(UNSHOWN_DOOR_ID),
      openness,
    })

    expect(openness.get(UNSHOWN_DOOR_ID)?.primary).toBe(FULLY_OPEN)
  })

  it('leaves a shown opening part way through its swing, so the tick still plays it', () => {
    const openness = new Map([[SHOWN_DOOR_ID, poseAt(PART_WAY)]])

    settleUnshownOpenings({
      openings: [doorWithId(SHOWN_DOOR_ID)],
      interaction: holdingOpen(SHOWN_DOOR_ID),
      openness,
    })

    expect(openness.get(SHOWN_DOOR_ID)?.primary).toBe(PART_WAY)
  })

  it('gives no openness to an unshown opening that carries none, even one the session holds open', () => {
    const openness = new Map<string, OpeningPose>()

    settleUnshownOpenings({
      openings: [doorWithId(SHOWN_DOOR_ID)],
      interaction: holdingOpen(UNSHOWN_DOOR_ID),
      openness,
    })

    expect(openness.has(UNSHOWN_DOOR_ID)).toBe(false)
  })
})
