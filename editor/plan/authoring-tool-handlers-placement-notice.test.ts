import { describe, it, expect, vi } from 'vitest'
import { createSelectionStore } from '../../bridge'
import type { Opening } from '../../core'
import { createOpening } from '../../core'
import {
  CLEAR_OF_WALL_Y,
  DOOR_TYPE,
  FLOOR_ID,
  graphWithOneWall,
  sessionWithOpenings,
  WALL_MIDPOINT_X,
} from './authoring-tool-handlers-test-fixtures'
import { handleOpeningKey, type AuthoringRun } from './authoring-tool-handlers'
import type { PlacementRefusal } from './overlay-announce'

function runWithCandidate(
  openings: readonly Opening[],
  candidate: { x: number; y: number },
): AuthoringRun {
  return {
    session: sessionWithOpenings(openings),
    activeFloorId: FLOOR_ID,
    candidate,
    setCandidate: vi.fn(),
    setAnnouncement: vi.fn(),
    selection: createSelectionStore(),
  }
}

function keyEvent(key: string): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, cancelable: true })
}

function pressOnOpeningTool(
  run: AuthoringRun,
  key: string,
  setPlacementRefusal: (refusal: PlacementRefusal | null) => void,
): void {
  handleOpeningKey({
    ...run,
    event: keyEvent(key),
    graph: graphWithOneWall(),
    placementType: DOOR_TYPE,
    setPlacementRefusal,
  })
}

describe('handleOpeningKey reports its outcome to the placement notice', () => {
  it('reports no host wall when Enter drops a candidate clear of every wall', () => {
    const setPlacementRefusal = vi.fn()
    const run = runWithCandidate([], { x: WALL_MIDPOINT_X, y: CLEAR_OF_WALL_Y })

    pressOnOpeningTool(run, 'Enter', setPlacementRefusal)

    expect(setPlacementRefusal).toHaveBeenCalledWith('no-host-wall')
  })

  // The notice has its own entry in the live region, so the refusal is spoken from there and
  // leaves with the notice. A sentence also kept in the authoring announcement would outlive it.
  it('clears the authoring announcement when Enter drops a candidate clear of every wall', () => {
    const run = runWithCandidate([], { x: WALL_MIDPOINT_X, y: CLEAR_OF_WALL_Y })

    pressOnOpeningTool(run, 'Enter', vi.fn())

    expect(run.setAnnouncement).toHaveBeenCalledWith('')
  })

  it('clears the authoring announcement when Enter drops onto a door already in the wall', () => {
    const existingDoor = createOpening({
      id: 'existing',
      type: DOOR_TYPE,
      hostWallId: 'w1',
      position: WALL_MIDPOINT_X,
    })
    const run = runWithCandidate([existingDoor], { x: WALL_MIDPOINT_X, y: 0 })

    pressOnOpeningTool(run, 'Enter', vi.fn())

    expect(run.setAnnouncement).toHaveBeenCalledWith('')
  })

  it('reports an overlap when Enter drops onto a door already in the wall', () => {
    const setPlacementRefusal = vi.fn()
    const existingDoor = createOpening({
      id: 'existing',
      type: DOOR_TYPE,
      hostWallId: 'w1',
      position: WALL_MIDPOINT_X,
    })
    const run = runWithCandidate([existingDoor], { x: WALL_MIDPOINT_X, y: 0 })

    pressOnOpeningTool(run, 'Enter', setPlacementRefusal)

    expect(setPlacementRefusal).toHaveBeenCalledWith('opening-overlap')
  })

  it('clears the notice when Enter drops an opening that lands', () => {
    const setPlacementRefusal = vi.fn()
    const run = runWithCandidate([], { x: WALL_MIDPOINT_X, y: 0 })

    pressOnOpeningTool(run, 'Enter', setPlacementRefusal)

    expect(setPlacementRefusal).toHaveBeenCalledWith(null)
  })

  it('leaves the notice alone when an arrow key nudges the candidate', () => {
    const setPlacementRefusal = vi.fn()
    const run = runWithCandidate([], { x: WALL_MIDPOINT_X, y: 0 })

    pressOnOpeningTool(run, 'ArrowRight', setPlacementRefusal)

    expect(setPlacementRefusal).not.toHaveBeenCalled()
  })
})
