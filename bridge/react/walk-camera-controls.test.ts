import { describe, expect, it, vi } from 'vitest'

import {
  emptyOpeningInteraction,
  isOpeningOpen,
  type OpeningInteractionState,
  type OpeningPose,
  type OpeningSceneNode,
  type WalkState,
  WALK_EYE_HEIGHT_MM,
} from '../../core'

import { openPartsWith } from '../open-parts-test-support'
import { walkKeyHandlers } from './walk-session'

const DOOR_ID = 'opening:front-door'
const DOOR_OPEN = openPartsWith({ [DOOR_ID]: ['primary'] })

const UPPER_FLOOR_ELEVATION_MM = 3000
const BASEMENT_ELEVATION_MM = -2700

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
    openness: { current: new Map<string, OpeningPose>() },
  }
}

// A door sits on its own floor: its sill and its centre are measured from that floor, so the
// floor's elevation shows only in the world height of the walker's eye. The walker stands at the
// same plan position and heading as FACING_DOOR, with the eye one standing height above the floor.
function sessionFacingOnFloor(door: OpeningSceneNode, floorElevationMm: number) {
  const eyeOnFloor: WalkState = {
    ...FACING_DOOR,
    position: { ...FACING_DOOR.position, y: floorElevationMm + WALK_EYE_HEIGHT_MM },
  }
  return { ...sessionFacing(door), state: { current: eyeOnFloor } }
}

function handlersFor(session: ReturnType<typeof sessionWith>) {
  return walkKeyHandlers(session as unknown as Parameters<typeof walkKeyHandlers>[0])
}

describe('walk camera controls: reset key', () => {
  it('resets every open opening to closed and marks user control when KeyR is pressed', () => {
    const session = sessionWith({ openParts: DOOR_OPEN })

    handlersFor(session).onKeyDown(new KeyboardEvent('keydown', { code: 'KeyR' }))

    expect(session.interaction.current).toEqual(emptyOpeningInteraction())
    expect(session.onUserControl).toHaveBeenCalledTimes(1)
  })

  it('leaves openings untouched and does not mark control for an unmapped key', () => {
    const session = sessionWith({ openParts: DOOR_OPEN })

    handlersFor(session).onKeyDown(new KeyboardEvent('keydown', { code: 'KeyZ' }))

    expect(isOpeningOpen(session.interaction.current, DOOR_ID)).toBe(true)
    expect(session.onUserControl).not.toHaveBeenCalled()
  })

  it('reports an empty map of open parts when KeyR shuts every opening', () => {
    // The session outlives the preview, so the doors the walker shut have to be
    // reported outward or a later mount would reopen them.
    const session = sessionWith({ openParts: DOOR_OPEN })

    handlersFor(session).onKeyDown(new KeyboardEvent('keydown', { code: 'KeyR' }))

    expect(session.onOpenDoors).toHaveBeenCalledWith(new Map())
  })
})

describe('walk camera controls: interact key', () => {
  it('reports the doors now open when KeyE opens the looked-at door', () => {
    const session = sessionFacing(frontDoor())

    handlersFor(session).onKeyDown(new KeyboardEvent('keydown', { code: 'KeyE' }))

    expect(isOpeningOpen(session.interaction.current, DOOR_ID)).toBe(true)
    expect(session.onOpenDoors).toHaveBeenCalledWith(DOOR_OPEN)
  })

  it('opens the door the walker faces on a floor 3000 mm above the ground with KeyE', () => {
    const session = sessionFacingOnFloor(frontDoor(), UPPER_FLOOR_ELEVATION_MM)

    handlersFor(session).onKeyDown(new KeyboardEvent('keydown', { code: 'KeyE' }))

    expect(isOpeningOpen(session.interaction.current, DOOR_ID)).toBe(true)
    expect(session.onOpenDoors).toHaveBeenCalledWith(DOOR_OPEN)
  })

  it('opens the door the walker faces in a basement 2700 mm below the ground with KeyE', () => {
    const session = sessionFacingOnFloor(frontDoor(), BASEMENT_ELEVATION_MM)

    handlersFor(session).onKeyDown(new KeyboardEvent('keydown', { code: 'KeyE' }))

    expect(isOpeningOpen(session.interaction.current, DOOR_ID)).toBe(true)
    expect(session.onOpenDoors).toHaveBeenCalledWith(DOOR_OPEN)
  })

  it('reports no stale sash part of a retyped door when KeyE opens and then shuts it', () => {
    const door = frontDoor()
    const session = {
      ...sessionFacing(door),
      interaction: { current: { openParts: openPartsWith({ [DOOR_ID]: ['upper'] }) } },
    }
    const handlers = handlersFor(session)

    handlers.onKeyDown(new KeyboardEvent('keydown', { code: 'KeyE' }))
    expect(session.onOpenDoors).toHaveBeenLastCalledWith(DOOR_OPEN)

    handlers.onKeyDown(new KeyboardEvent('keydown', { code: 'KeyE' }))
    expect(session.onOpenDoors).toHaveBeenLastCalledWith(new Map())
  })
})
