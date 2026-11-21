import { afterEach, describe, it, expect, vi } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { ADD_STAIR, createEmptyProject, createFloor } from '../../core'
import type { AddStairParams, Command, Floor } from '../../core'
import { createSelectionStore } from '../../bridge'
import { createEditorSession } from '../../session/testing'
import { OpeningToolProvider, useOpeningTool } from './opening-tool-context'
import { usePlanAuthoring } from './use-plan-authoring'

afterEach(cleanup)

const GROUND_ID = 'ground'
const UPPER_ID = 'upper'
const GROUND_ELEVATION_MM = 0
const UPPER_ELEVATION_MM = 2700
const CANDIDATE_STEP_MM = 100

function floor(id: string, elevation: number): Floor {
  return createFloor(id, { id, elevation })
}

function press(key: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true }))
}

// The real authoring hook under the stair tool, on a project with the given floors,
// beside the placement context the plan overlay reads its refusal notice from.
function renderStairAuthoring(floors: readonly Floor[], activeFloorId: string) {
  const project = createEmptyProject({
    name: 'T',
    units: 'metric',
    period: 'modern',
    appVersion: '0.0.0',
  })
  project.floors = [...floors]
  const session = createEditorSession(project)
  const dispatch = vi.spyOn(session, 'dispatch')
  const selection = createSelectionStore()
  const graph = session.getSceneGraph()
  const { result } = renderHook(
    () => ({
      authoring: usePlanAuthoring({
        session,
        selection,
        tool: 'place-stair',
        activeFloorId,
        graph,
      }),
      openingTool: useOpeningTool(),
    }),
    { wrapper: OpeningToolProvider },
  )
  return { dispatch, result }
}

function twoFloors(): readonly Floor[] {
  return [floor(GROUND_ID, GROUND_ELEVATION_MM), floor(UPPER_ID, UPPER_ELEVATION_MM)]
}

describe('usePlanAuthoring under the place-stair tool', () => {
  it('moves the keyboard candidate one step for each arrow key', () => {
    const { dispatch, result } = renderStairAuthoring(twoFloors(), GROUND_ID)

    act(() => press('ArrowRight'))
    act(() => press('ArrowUp'))

    expect(result.current.authoring.candidate).toEqual({
      x: CANDIDATE_STEP_MM,
      y: CANDIDATE_STEP_MM,
    })
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('places one stair at the candidate on Enter when a floor sits above', () => {
    const { dispatch, result } = renderStairAuthoring(twoFloors(), GROUND_ID)
    act(() => press('ArrowRight'))

    act(() => press('Enter'))

    expect(dispatch).toHaveBeenCalledTimes(1)
    const command = dispatch.mock.calls[0]?.[0] as Command
    expect(command.type).toBe(ADD_STAIR)
    const { stair } = command.params as AddStairParams
    expect(stair.connection).toEqual({ fromFloorId: GROUND_ID, toFloorId: UPPER_ID })
    expect(stair.position).toEqual(result.current.authoring.candidate)
    expect(result.current.openingTool.placementRefusal).toBeNull()
  })

  it('announces the stair it placed in the live region', () => {
    const { result } = renderStairAuthoring(twoFloors(), GROUND_ID)

    act(() => press('Enter'))

    expect(result.current.authoring.announcement).toMatch(/stair/i)
    expect(result.current.authoring.announcement).toMatch(/placed/i)
  })

  it('places nothing and refuses with no-floor-above on Enter when no floor sits above', () => {
    const { dispatch, result } = renderStairAuthoring(twoFloors(), UPPER_ID)

    act(() => press('Enter'))

    expect(dispatch).not.toHaveBeenCalled()
    expect(result.current.openingTool.placementRefusal).toBe('no-floor-above')
  })
})
