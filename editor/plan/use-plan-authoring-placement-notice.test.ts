import { afterEach, describe, it, expect, vi } from 'vitest'
import { createElement, type ReactNode } from 'react'
import { renderHook, act, cleanup } from '@testing-library/react'
import { createOpening } from '../../core'
import type { Opening, SceneGraph, WallSceneNode } from '../../core'
import { createSelectionStore } from '../../bridge'
import type { EditorSession } from '../../bridge'
import { OpeningToolProvider, useOpeningTool } from './opening-tool-context'
import { usePlanAuthoring } from './use-plan-authoring'

afterEach(cleanup)

const FLOOR_ID = 'g'
const DOOR_TYPE = 'single-swing-door'
// A 1000 mm wall straddling the seeded origin candidate; its midpoint, in mm
// along the wall, is where the existing door sits.
const WALL_HALF_LENGTH_MM = 500
const WALL_MIDPOINT_MM = 500
const WALL_THICKNESS_MM = 100

function dispatchEnter(): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
}

function graphWithOneWall(): SceneGraph {
  const wall: WallSceneNode = {
    id: 'w1',
    kind: 'wall',
    floorId: FLOOR_ID,
    start: { x: -WALL_HALF_LENGTH_MM, y: 0 },
    end: { x: WALL_HALF_LENGTH_MM, y: 0 },
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

function doorAtWallMidpoint(): Opening {
  return createOpening({
    id: 'existing',
    type: DOOR_TYPE,
    hostWallId: 'w1',
    position: WALL_MIDPOINT_MM,
  })
}

function renderOpeningAuthoring(session: EditorSession) {
  const graph = graphWithOneWall()
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(OpeningToolProvider, null, children)
  return renderHook(
    () => ({
      authoring: usePlanAuthoring({
        session,
        tool: 'place-opening',
        activeFloorId: FLOOR_ID,
        graph,
        placementType: DOOR_TYPE,
        selection: createSelectionStore(),
      }),
      openingTool: useOpeningTool(),
    }),
    { wrapper },
  )
}

describe('usePlanAuthoring reports a keyboard opening drop to the placement notice', () => {
  it('shows the overlap notice for a refused Enter and clears it when a later Enter lands', () => {
    const dispatch = vi.fn()
    let openings: readonly Opening[] = [doorAtWallMidpoint()]
    const session = {
      dispatch,
      getProject: () => ({ floors: [{ id: FLOOR_ID, openings }] }),
      undo: vi.fn(),
    } as unknown as EditorSession
    const { result } = renderOpeningAuthoring(session)

    act(dispatchEnter)
    expect(dispatch).not.toHaveBeenCalled()
    expect(result.current.openingTool.placementRefusal).toBe('opening-overlap')

    openings = []
    act(dispatchEnter)
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(result.current.openingTool.placementRefusal).toBeNull()
  })
})
