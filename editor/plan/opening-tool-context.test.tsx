import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { addFloor, addWall, createEmptyProject } from '../../core'
import { createEditorSession } from '../../session/testing'
import {
  OpeningToolProvider,
  useOpeningTool,
  useRetireStaleRefusal,
  type RefusalBasis,
} from './opening-tool-context'

afterEach(cleanup)

type Session = ReturnType<typeof createEditorSession>

const WALL_END_MM = 500

function sessionWithOneFloor(): Session {
  const session = createEditorSession(
    createEmptyProject({ name: 'Test', units: 'metric', period: 'modern', appVersion: '0.0.0' }),
  )
  session.dispatch(addFloor('Ground'))
  return session
}

function addWallOnGround(session: Session): void {
  const floorId = session.getProject().floors[0]!.id
  session.dispatch(addWall(floorId, { x: 0, y: 0 }, { x: WALL_END_MM, y: 0 }))
}

function basisOf(session: Session): RefusalBasis {
  return {
    tool: 'place-door',
    sceneGraph: session.getSceneGraph(),
    activeFloorId: session.getProject().floors[0]!.id,
    selectedIds: new Set(),
    candidate: { x: 0, y: 0 },
  }
}

// Mounts the provider with the retirement hook over a real session and leaves
// an opening-overlap refusal standing. `planChanged` hands the hook the
// session's scene graph as it is now, as the plan does after a change.
function mountWithStandingRefusal(session: Session) {
  const { result, rerender } = renderHook(
    (basis: RefusalBasis) => {
      useRetireStaleRefusal(basis)
      return useOpeningTool()
    },
    { wrapper: OpeningToolProvider, initialProps: basisOf(session) },
  )
  act(() => {
    result.current.setPlacementRefusal('opening-overlap')
  })
  return {
    refusal: () => result.current.placementRefusal,
    planChanged: () => rerender(basisOf(session)),
  }
}

describe('a standing refusal when the plan changes', () => {
  it('retires after an edit is dispatched', () => {
    const session = sessionWithOneFloor()
    const { refusal, planChanged } = mountWithStandingRefusal(session)
    expect(refusal()).toBe('opening-overlap')

    addWallOnGround(session)
    planChanged()

    expect(refusal()).toBeNull()
  })

  it('retires after an undo', () => {
    const session = sessionWithOneFloor()
    addWallOnGround(session)
    const { refusal, planChanged } = mountWithStandingRefusal(session)
    expect(refusal()).toBe('opening-overlap')

    session.undo()
    planChanged()

    expect(refusal()).toBeNull()
  })

  it('retires after a redo', () => {
    const session = sessionWithOneFloor()
    addWallOnGround(session)
    session.undo()
    const { refusal, planChanged } = mountWithStandingRefusal(session)
    expect(refusal()).toBe('opening-overlap')

    session.redo()
    planChanged()

    expect(refusal()).toBeNull()
  })
})
