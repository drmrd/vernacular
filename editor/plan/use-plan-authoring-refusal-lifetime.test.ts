import { afterEach, describe, expect, it } from 'vitest'
import { createElement, useSyncExternalStore, type ReactNode } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { addFloor, addWall, createEmptyProject } from '../../core'
import { createSelectionStore, type EditorSession, type SelectionStore } from '../../bridge'
import { createEditorSession } from '../../session/testing'
import { OpeningToolProvider, useOpeningTool, useRetireStaleRefusal } from './opening-tool-context'
import { placementRefusalMessage } from './overlay-announce'
import { usePlanAuthoring } from './use-plan-authoring'

afterEach(cleanup)

// A wall through the seeded origin candidate, so Enter at the origin places a door.
const WALL_HALF_LENGTH_MM = 500

function press(key: string): void {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key }))
  })
}

function sessionWithWallThroughOrigin(): EditorSession {
  const session = createEditorSession(
    createEmptyProject({ name: 'Test', units: 'metric', period: 'modern', appVersion: '0.0.0' }),
  )
  session.dispatch(addFloor('Ground'))
  const floorId = session.getProject().floors[0]!.id
  session.dispatch(
    addWall(floorId, { x: -WALL_HALF_LENGTH_MM, y: 0 }, { x: WALL_HALF_LENGTH_MM, y: 0 }),
  )
  return session
}

// The keyboard opening path as the plan view wires it: the real window listener of
// usePlanAuthoring, and the retire hook over the same session, selection, and candidate.
function renderKeyboardOpeningPath(session: EditorSession, selection: SelectionStore) {
  const floorId = session.getProject().floors[0]!.id
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(OpeningToolProvider, null, children)
  return renderHook(
    () => {
      const graph = useSyncExternalStore(session.subscribe, session.getSceneGraph)
      const selectedIds = useSyncExternalStore(selection.subscribe, selection.getSelectedIds)
      const openingTool = useOpeningTool()
      const authoring = usePlanAuthoring({
        session,
        selection,
        tool: 'place-opening',
        activeFloorId: floorId,
        graph,
        placementType: openingTool.placementType,
      })
      useRetireStaleRefusal({
        tool: 'place-opening',
        sceneGraph: graph,
        activeFloorId: floorId,
        selectedIds,
        candidate: authoring.candidate,
      })
      return { authoring, openingTool }
    },
    { wrapper },
  )
}

describe('a refusal from a keyboard opening drop', () => {
  it('retires when an arrow key nudges the candidate', () => {
    const session = sessionWithWallThroughOrigin()
    const { result } = renderKeyboardOpeningPath(session, createSelectionStore())
    press('Enter')
    press('Enter')
    expect(result.current.openingTool.placementRefusal).toBe('opening-overlap')

    press('ArrowRight')

    expect(result.current.openingTool.placementRefusal).toBeNull()
  })

  it('retires on an undo, and the live text no longer states the refusal', () => {
    const session = sessionWithWallThroughOrigin()
    const { result } = renderKeyboardOpeningPath(session, createSelectionStore())
    press('Enter')
    press('Enter')
    expect(result.current.openingTool.placementRefusal).toBe('opening-overlap')

    act(() => {
      session.undo()
    })

    expect(result.current.openingTool.placementRefusal).toBeNull()
    expect(result.current.authoring.announcement).not.toBe(
      placementRefusalMessage('opening-overlap'),
    )
  })

  it('retires on a redo', () => {
    const session = sessionWithWallThroughOrigin()
    const { result } = renderKeyboardOpeningPath(session, createSelectionStore())
    press('Enter')
    act(() => {
      session.undo()
    })
    for (let step = 0; step < 3; step += 1) press('ArrowDown')
    press('Enter')
    expect(result.current.openingTool.placementRefusal).toBe('no-host-wall')

    act(() => {
      session.redo()
    })

    expect(result.current.openingTool.placementRefusal).toBeNull()
  })

  it('retires when the placement type changes', () => {
    const session = sessionWithWallThroughOrigin()
    const { result } = renderKeyboardOpeningPath(session, createSelectionStore())
    press('Enter')
    press('Enter')
    expect(result.current.openingTool.placementRefusal).toBe('opening-overlap')

    act(() => result.current.openingTool.setPlacementType('double-swing-door'))

    expect(result.current.openingTool.placementRefusal).toBeNull()
  })

  it('stands after a repeated Enter at the same candidate', () => {
    const session = sessionWithWallThroughOrigin()
    const { result } = renderKeyboardOpeningPath(session, createSelectionStore())
    press('Enter')
    press('Enter')
    const attempts = result.current.openingTool.refusalAttempt

    press('Enter')

    expect(result.current.openingTool.placementRefusal).toBe('opening-overlap')
    expect(result.current.openingTool.refusalAttempt).toBe(attempts + 1)
  })
})
