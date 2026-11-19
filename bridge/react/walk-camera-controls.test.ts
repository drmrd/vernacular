import { describe, expect, it, vi } from 'vitest'

import {
  emptyOpeningInteraction,
  isOpeningOpen,
  type OpeningInteractionState,
  type OpeningSceneNode,
  type WalkState,
} from '../../core'

import { walkKeyHandlers } from './walk-session'

const DOOR_ID = 'opening:front-door'

// The KeyR branch touches only `interaction`, `onUserControl`, and `onOpenDoors`, so a
// minimal stand-in for the WalkSession carries just those three real fields.
function sessionWith(interaction: OpeningInteractionState) {
  return {
    interaction: { current: interaction },
    onUserControl: vi.fn(),
    onOpenDoors: vi.fn(),
  }
}

// A door whose wall runs along world X at world Z = -2000 (plan y maps to world -z).
function frontDoor(): OpeningSceneNode {
  return {
    id: DOOR_ID,
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

// Standing 1000mm in front of that door, eye at standing height, looking down -Z
// straight at it, so the door is the opening within reach.
const FACING_DOOR: WalkState = { position: { x: 1000, y: 1700, z: -1000 }, yaw: 0, pitch: 0 }

// The KeyE branch reads the walk pose, the openings on the floor, and their openness
// on top of the fields the KeyR branch touches.
function sessionFacing(door: OpeningSceneNode) {
  return {
    ...sessionWith(emptyOpeningInteraction()),
    state: { current: FACING_DOOR },
    openings: { current: [door] },
    openness: { current: new Map<string, number>() },
  }
}

function handlersFor(session: ReturnType<typeof sessionWith>) {
  return walkKeyHandlers(session as unknown as Parameters<typeof walkKeyHandlers>[0])
}

describe('walk camera controls: reset key', () => {
  it('resets every open opening to closed and marks user control when KeyR is pressed', () => {
    const session = sessionWith({ openIds: new Set([DOOR_ID]) })

    handlersFor(session).onKeyDown(new KeyboardEvent('keydown', { code: 'KeyR' }))

    expect(session.interaction.current).toEqual(emptyOpeningInteraction())
    expect(session.onUserControl).toHaveBeenCalledTimes(1)
  })

  it('leaves openings untouched and does not mark control for an unmapped key', () => {
    const session = sessionWith({ openIds: new Set([DOOR_ID]) })

    handlersFor(session).onKeyDown(new KeyboardEvent('keydown', { code: 'KeyZ' }))

    expect(isOpeningOpen(session.interaction.current, DOOR_ID)).toBe(true)
    expect(session.onUserControl).not.toHaveBeenCalled()
  })

  it('reports an empty set of open doors when KeyR shuts every opening', () => {
    // The session outlives the preview, so the doors the walker shut have to be
    // reported outward or a later mount would reopen them.
    const session = sessionWith({ openIds: new Set([DOOR_ID]) })

    handlersFor(session).onKeyDown(new KeyboardEvent('keydown', { code: 'KeyR' }))

    expect(session.onOpenDoors).toHaveBeenCalledWith(new Set<string>())
  })
})

describe('walk camera controls: interact key', () => {
  it('reports the doors now open when KeyE opens the looked-at door', () => {
    const session = sessionFacing(frontDoor())

    handlersFor(session).onKeyDown(new KeyboardEvent('keydown', { code: 'KeyE' }))

    expect(isOpeningOpen(session.interaction.current, DOOR_ID)).toBe(true)
    expect(session.onOpenDoors).toHaveBeenCalledWith(new Set([DOOR_ID]))
  })
})
