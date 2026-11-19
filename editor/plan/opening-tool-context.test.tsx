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
import type { PlacementRefusal } from './overlay-announce'

afterEach(cleanup)

type Session = ReturnType<typeof createEditorSession>

const WALL_END_MM = 500

// Shared by every basis, so a rerender changes only what a test changes.
const NO_SELECTION: ReadonlySet<string> = new Set<string>()
const ORIGIN = { x: 0, y: 0 }
const GROUND_FLOOR_ID = 'ground-floor'

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
    tool: 'place-opening',
    sceneGraph: session.getSceneGraph(),
    activeFloorId: GROUND_FLOOR_ID,
    selectedIds: NO_SELECTION,
    candidate: ORIGIN,
  }
}

// Mounts the provider with the retirement hook over a real session and leaves
// a refusal standing. `rerenderWith` hands the hook a new basis; `planChanged`
// copies the basis it last had and replaces only the scene graph, as the plan
// does after an edit, an undo, or a redo.
function mountWithStandingRefusal(session: Session, reason: PlacementRefusal = 'opening-overlap') {
  let current = basisOf(session)
  const { result, rerender } = renderHook(
    (basis: RefusalBasis) => {
      useRetireStaleRefusal(basis)
      return useOpeningTool()
    },
    { wrapper: OpeningToolProvider, initialProps: current },
  )
  act(() => {
    result.current.setPlacementRefusal(reason)
  })
  const rerenderWith = (next: RefusalBasis) => {
    current = next
    rerender(next)
  }
  return {
    refusal: () => result.current.placementRefusal,
    basis: () => current,
    rerenderWith,
    choosePlacementType: (id: string) => act(() => result.current.setPlacementType(id)),
    // One act, so the basis and the report reach one commit, in the order of a
    // keydown that selects an entity and drops an opening at once.
    reportWithBasisChange: (next: RefusalBasis, reason: PlacementRefusal) =>
      act(() => {
        rerenderWith(next)
        result.current.setPlacementRefusal(reason)
      }),
    report: (reason: PlacementRefusal) => act(() => result.current.setPlacementRefusal(reason)),
    planChanged: () => {
      const previousGraph = current.sceneGraph
      const nextGraph = session.getSceneGraph()
      expect(nextGraph).not.toBe(previousGraph)
      rerenderWith({ ...current, sceneGraph: nextGraph })
    },
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

describe('a standing refusal when the situation stays the same', () => {
  it('stays when the hook renders again with the same basis references', () => {
    const { refusal, basis, rerenderWith } = mountWithStandingRefusal(sessionWithOneFloor())

    rerenderWith({ ...basis() })

    expect(refusal()).toBe('opening-overlap')
  })
})

describe('a standing refusal when one input of the situation changes', () => {
  it('retires when only the active floor changes', () => {
    const { refusal, basis, rerenderWith } = mountWithStandingRefusal(
      sessionWithOneFloor(),
      'no-floor-above',
    )
    expect(refusal()).toBe('no-floor-above')

    rerenderWith({ ...basis(), activeFloorId: 'upper-floor' })

    expect(refusal()).toBeNull()
  })

  it('retires when only the selection changes to a new set', () => {
    const { refusal, basis, rerenderWith } = mountWithStandingRefusal(sessionWithOneFloor())
    const otherSelection = new Set<string>()
    expect(otherSelection).not.toBe(basis().selectedIds)

    rerenderWith({ ...basis(), selectedIds: otherSelection })

    expect(refusal()).toBeNull()
  })

  it('retires when only the tool changes', () => {
    const { refusal, basis, rerenderWith } = mountWithStandingRefusal(sessionWithOneFloor())

    rerenderWith({ ...basis(), tool: 'place-stair' })

    expect(refusal()).toBeNull()
  })

  it('retires when only the placement type changes', () => {
    const { refusal, choosePlacementType } = mountWithStandingRefusal(sessionWithOneFloor())

    choosePlacementType('double-swing-door')

    expect(refusal()).toBeNull()
  })
})

describe('a standing refusal when the keyboard candidate is replaced', () => {
  it('stays when the new candidate has the same x and y', () => {
    const { refusal, basis, rerenderWith } = mountWithStandingRefusal(sessionWithOneFloor())
    const sameSpot = { x: ORIGIN.x, y: ORIGIN.y }
    expect(sameSpot).not.toBe(basis().candidate)

    rerenderWith({ ...basis(), candidate: sameSpot })

    expect(refusal()).toBe('opening-overlap')
  })

  it('retires when the candidate has a different x', () => {
    const { refusal, basis, rerenderWith } = mountWithStandingRefusal(sessionWithOneFloor())

    rerenderWith({ ...basis(), candidate: { x: ORIGIN.x + 1, y: ORIGIN.y } })

    expect(refusal()).toBeNull()
  })

  it('retires when the candidate has a different y', () => {
    const { refusal, basis, rerenderWith } = mountWithStandingRefusal(sessionWithOneFloor())

    rerenderWith({ ...basis(), candidate: { x: ORIGIN.x, y: ORIGIN.y + 1 } })

    expect(refusal()).toBeNull()
  })
})

describe('the count of refused attempts', () => {
  it('rises by one for each reason reported, a repeat of the standing reason included', () => {
    const { result } = renderHook(() => useOpeningTool(), { wrapper: OpeningToolProvider })
    expect(result.current.refusalAttempt).toBe(0)

    act(() => result.current.setPlacementRefusal('opening-overlap'))
    expect(result.current.refusalAttempt).toBe(1)

    act(() => result.current.setPlacementRefusal('opening-overlap'))
    expect(result.current.refusalAttempt).toBe(2)
  })

  it('does not rise when the refusal is cleared with null', () => {
    const { result } = renderHook(() => useOpeningTool(), { wrapper: OpeningToolProvider })
    act(() => result.current.setPlacementRefusal('no-host-wall'))
    expect(result.current.refusalAttempt).toBe(1)

    act(() => result.current.setPlacementRefusal(null))

    expect(result.current.refusalAttempt).toBe(1)
  })
})

describe('a refusal reported in the same commit as a change of the basis', () => {
  it('stands after that commit and retires at the next change of the basis', () => {
    const session = sessionWithOneFloor()
    const { refusal, basis, reportWithBasisChange, planChanged } = mountWithStandingRefusal(session)
    expect(refusal()).toBe('opening-overlap')

    reportWithBasisChange({ ...basis(), selectedIds: new Set<string>() }, 'no-host-wall')
    expect(refusal()).toBe('no-host-wall')

    addWallOnGround(session)
    planChanged()
    expect(refusal()).toBeNull()
  })

  it('retires when the basis changes in a later commit than the report', () => {
    const { refusal, basis, report, rerenderWith } = mountWithStandingRefusal(sessionWithOneFloor())

    report('no-host-wall')
    expect(refusal()).toBe('no-host-wall')
    rerenderWith({ ...basis(), selectedIds: new Set<string>() })

    expect(refusal()).toBeNull()
  })
})
