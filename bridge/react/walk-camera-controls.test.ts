import { describe, expect, it, vi } from 'vitest'

import {
  emptyOpeningInteraction,
  isOpeningOpen,
  WALK_EYE_HEIGHT_MM,
  type OpeningInteractionState,
  type SceneGraph,
} from '../../core'

import { seedWalkState, walkFloorElevationMm, walkKeyHandlers } from './walk-camera-controls'

const DOOR_ID = 'opening:front-door'

// The KeyR branch touches only `interaction` and `onUserControl`, so a minimal
// stand-in for the (unexported) WalkSession carries just those two real fields.
function sessionWith(interaction: OpeningInteractionState) {
  return {
    interaction: { current: interaction },
    onUserControl: vi.fn(),
  }
}

function handlersFor(session: ReturnType<typeof sessionWith>) {
  return walkKeyHandlers(session as unknown as Parameters<typeof walkKeyHandlers>[0])
}

// A minimal WalkCamera-shaped stand-in: an identity world matrix (so the camera
// faces the default -Z heading) at the world origin. seedWalkState reads only the
// camera's world-matrix forward axis and its horizontal (x, z) position, never its
// y, so this stub carries no real eye height of its own.
function stubCamera() {
  return {
    position: { x: 0, y: 0, z: 0, set: () => {} },
    matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
    updateWorldMatrix: () => {},
    lookAt: () => {},
  }
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
})

describe('walk camera controls: eye height seeding', () => {
  it("seeds the walk pose's eye height on the active floor's elevation, not the ground-floor datum", () => {
    // An upper floor sitting 3000mm above the ground-floor datum: entering walk
    // mode there must stand the eye on that floor's slab, not below it.
    const upperFloorElevationMm = 3000

    const seeded = seedWalkState(
      stubCamera() as unknown as Parameters<typeof seedWalkState>[0],
      upperFloorElevationMm,
    )

    expect(seeded.position.y).toBe(upperFloorElevationMm + WALK_EYE_HEIGHT_MM)
  })
})

describe('walk camera controls: floor elevation derivation', () => {
  it("derives the walk floor elevation from the active floor's scene-graph node", () => {
    // A scene graph narrowed to the active (upper) floor carries that floor's
    // own node, elevation and all: the walk pose must stand on that number,
    // not on a hardcoded ground-floor datum.
    const upperFloorElevationMm = 3000
    const graph: SceneGraph = {
      nodes: [
        { id: 'floor:upper', kind: 'floor', name: 'Upper', elevation: upperFloorElevationMm },
      ],
      walls: [],
      rooms: [],
      underlays: [],
      openings: [],
      dimensions: [],
      stairs: [],
      furniture: [],
    }

    expect(walkFloorElevationMm(graph)).toBe(upperFloorElevationMm)
  })
})
