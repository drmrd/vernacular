import { describe, it, expect, vi } from 'vitest'
import type { EditorSession } from '../../bridge'
import { createSelectionStore } from '../../bridge'
import type { Opening, SceneGraph, WallSceneNode } from '../../core'
import { createOpening } from '../../core'
import { handleOpeningKey, type AuthoringRun } from './authoring-tool-handlers'
import { placementRefusalMessage, type PlacementRefusal } from './overlay-announce'

const FLOOR_ID = 'g'
// The wall runs along y = 0, so a candidate at y = 0 lands on it and one 500 mm
// away is well clear of the hit tolerance.
const WALL_LENGTH_MM = 2000
const WALL_THICKNESS_MM = 114
const WALL_MIDPOINT_X = 1000
const CLEAR_OF_WALL_Y = 500
const DOOR_TYPE = 'single-swing-door'

function sessionWithOpenings(openings: readonly Opening[]): EditorSession {
  return {
    dispatch: vi.fn(),
    getProject: () => ({ floors: [{ id: FLOOR_ID, openings }] }),
  } as unknown as EditorSession
}

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

function graphWithOneWall(): SceneGraph {
  const wall: WallSceneNode = {
    id: 'wall:w1',
    kind: 'wall',
    floorId: FLOOR_ID,
    start: { x: 0, y: 0 },
    end: { x: WALL_LENGTH_MM, y: 0 },
    thickness: WALL_THICKNESS_MM,
  }
  return {
    nodes: [],
    walls: [wall],
    rooms: [],
    underlays: [],
    openings: [],
    dimensions: [],
    stairs: [],
    furniture: [],
  }
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

  it('announces the sentence the notice shows when Enter drops a candidate clear of every wall', () => {
    const run = runWithCandidate([], { x: WALL_MIDPOINT_X, y: CLEAR_OF_WALL_Y })

    pressOnOpeningTool(run, 'Enter', vi.fn())

    expect(run.setAnnouncement).toHaveBeenCalledWith(placementRefusalMessage('no-host-wall'))
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
