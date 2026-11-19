import { expect } from 'vitest'
import { act, render, renderHook } from '@testing-library/react'
import { addFloor, addWall, createEmptyProject } from '../../core'
import { createEditorSession } from '../../session/testing'
import {
  OpeningToolProvider,
  useOpeningTool,
  useRetireStaleRefusal,
  type OpeningToolValue,
  type RefusalBasis,
} from './opening-tool-context'
import type { PlacementRefusal } from './overlay-announce'

type Session = ReturnType<typeof createEditorSession>

const WALL_END_MM = 500

// Shared by every basis, so a rerender changes only what a test changes.
const NO_SELECTION: ReadonlySet<string> = new Set<string>()
export const ORIGIN = { x: 0, y: 0 }
const GROUND_FLOOR_ID = 'ground-floor'

export function sessionWithOneFloor(): Session {
  const session = createEditorSession(
    createEmptyProject({ name: 'Test', units: 'metric', period: 'modern', appVersion: '0.0.0' }),
  )
  session.dispatch(addFloor('Ground'))
  return session
}

export function addWallOnGround(session: Session): void {
  const floorId = session.getProject().floors[0]!.id
  session.dispatch(addWall(floorId, { x: 0, y: 0 }, { x: WALL_END_MM, y: 0 }))
}

export function basisOf(session: Session): RefusalBasis {
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
export function mountWithStandingRefusal(
  session: Session,
  reason: PlacementRefusal = 'opening-overlap',
) {
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

// Reports a refusal while only the provider is mounted, then mounts a component
// that calls the retirement hook, as the plan view does when it first appears
// over a provider that already holds a refusal.
export function mountHookAfterRefusal(session: Session, reason: PlacementRefusal) {
  let tool: OpeningToolValue | undefined
  const basis = basisOf(session)
  function Probe() {
    tool = useOpeningTool()
    return null
  }
  function Retirer() {
    useRetireStaleRefusal(basis)
    return null
  }
  const treeWith = (retiring: boolean) => (
    <OpeningToolProvider>
      <Probe />
      {retiring ? <Retirer /> : null}
    </OpeningToolProvider>
  )
  const view = render(treeWith(false))
  act(() => tool!.setPlacementRefusal(reason))
  expect(tool!.placementRefusal).toBe(reason)
  return {
    refusal: () => tool!.placementRefusal,
    mountHook: () => view.rerender(treeWith(true)),
  }
}
