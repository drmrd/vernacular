import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import {
  EditorSessionProvider,
  SelectionProvider,
  SurfaceSelectionProvider,
  createSelectionStore,
  createSurfaceSelectionStore,
} from '../../bridge'
import {
  WALL_NODE_PREFIX,
  addWall,
  createEmptyProject,
  createFloor,
  createWall,
  type SurfaceRef,
} from '../../core'
import { createEditorSession } from '../../session/testing'
import { useEntitySurfaceBridge } from './use-entity-surface-bridge'

afterEach(cleanup)

const wallNodeId = (id: string): string => `${WALL_NODE_PREFIX}${id}`
const wallFace = (wallId: string, side: 'left' | 'right'): SurfaceRef => ({
  kind: 'wall-face',
  wallId,
  side,
})

function Bridge() {
  useEntitySurfaceBridge()
  return null
}

const FLOOR_ID = 'g'

/** One floor `g` holding a closed square of walls, which derives exactly one room. */
function buildSquareRoomSession() {
  const project = createEmptyProject({
    name: 'T',
    units: 'imperial',
    period: 'modern',
    appVersion: '0.0.0',
  })
  const walls = [
    createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }),
    createWall({ x: 4000, y: 0 }, { x: 4000, y: 3000 }),
    createWall({ x: 4000, y: 3000 }, { x: 0, y: 3000 }),
    createWall({ x: 0, y: 3000 }, { x: 0, y: 0 }),
  ]
  project.floors = [createFloor('G', { id: FLOOR_ID, walls })]
  return createEditorSession(project)
}

function mountBridge() {
  const session = buildSquareRoomSession()
  const selection = createSelectionStore()
  const surfaceSelection = createSurfaceSelectionStore()
  render(
    <EditorSessionProvider session={session}>
      <SelectionProvider store={selection}>
        <SurfaceSelectionProvider store={surfaceSelection}>
          <Bridge />
        </SurfaceSelectionProvider>
      </SelectionProvider>
    </EditorSessionProvider>,
  )
  const [room] = session.getSceneGraph().rooms
  if (room === undefined) throw new Error('expected the closed square of walls to derive a room')
  return { selection, surfaceSelection, session, roomId: room.id }
}

describe('useEntitySurfaceBridge when a wall becomes the selection', () => {
  it('keeps the right face of that wall when it is already the active surface', () => {
    const { selection, surfaceSelection } = mountBridge()
    surfaceSelection.select(wallFace('w1', 'right'))

    act(() => selection.select(wallNodeId('w1')))

    expect(surfaceSelection.getActiveSurface()).toEqual(wallFace('w1', 'right'))
  })

  it('keeps the left face of that wall when it is already the active surface', () => {
    const { selection, surfaceSelection } = mountBridge()
    surfaceSelection.select(wallFace('w1', 'left'))

    act(() => selection.select(wallNodeId('w1')))

    expect(surfaceSelection.getActiveSurface()).toEqual(wallFace('w1', 'left'))
  })

  it('sets the left face when the active surface is a face of another wall', () => {
    const { selection, surfaceSelection } = mountBridge()
    surfaceSelection.select(wallFace('w2', 'right'))

    act(() => selection.select(wallNodeId('w1')))

    expect(surfaceSelection.getActiveSurface()).toEqual(wallFace('w1', 'left'))
  })

  it('sets the left face when there is no active surface', () => {
    const { selection, surfaceSelection } = mountBridge()

    act(() => selection.select(wallNodeId('w1')))

    expect(surfaceSelection.getActiveSurface()).toEqual(wallFace('w1', 'left'))
  })
})

describe('useEntitySurfaceBridge when a floor surface is active', () => {
  const floorSurface: SurfaceRef = { kind: 'floor', floorId: FLOOR_ID }

  it('leaves the floor surface alone when the room of that floor becomes the selection', () => {
    const { selection, surfaceSelection, roomId } = mountBridge()
    surfaceSelection.select(floorSurface)

    act(() => selection.select(roomId))

    expect(surfaceSelection.getActiveSurface()).toEqual(floorSurface)
  })

  it('sets the left face when a wall becomes the selection', () => {
    const { selection, surfaceSelection } = mountBridge()
    surfaceSelection.select(floorSurface)

    act(() => selection.select(wallNodeId('w1')))

    expect(surfaceSelection.getActiveSurface()).toEqual(wallFace('w1', 'left'))
  })
})

describe('useEntitySurfaceBridge when a room becomes the selection', () => {
  it('makes the floor of that room the active surface when there is none', () => {
    const { selection, surfaceSelection, roomId } = mountBridge()

    act(() => selection.select(roomId))

    expect(surfaceSelection.getActiveSurface()).toEqual({ kind: 'floor', floorId: FLOOR_ID })
  })

  it('keeps the ceiling of that room when it is already the active surface', () => {
    const { selection, surfaceSelection, roomId } = mountBridge()
    const ceiling: SurfaceRef = { kind: 'ceiling', floorId: FLOOR_ID }
    surfaceSelection.select(ceiling)

    act(() => selection.select(roomId))

    expect(surfaceSelection.getActiveSurface()).toEqual(ceiling)
  })

  it('makes the floor of that room the active surface when a wall face was active', () => {
    const { selection, surfaceSelection, roomId } = mountBridge()
    surfaceSelection.select(wallFace('w1', 'right'))

    act(() => selection.select(roomId))

    expect(surfaceSelection.getActiveSurface()).toEqual({ kind: 'floor', floorId: FLOOR_ID })
  })

  it('keeps the active surface when the room is not in the scene graph', () => {
    const { selection, surfaceSelection } = mountBridge()
    surfaceSelection.select(wallFace('w1', 'right'))

    act(() => selection.select('room:missing'))

    expect(surfaceSelection.getActiveSurface()).toEqual(wallFace('w1', 'right'))
  })
})

describe('useEntitySurfaceBridge when the selection has no paintable face', () => {
  it.each(['chair-1', 'opening:o1', 'stair:s1'])(
    'clears the active surface when %s becomes the selection',
    (entityId) => {
      const { selection, surfaceSelection } = mountBridge()
      surfaceSelection.select({ kind: 'floor', floorId: FLOOR_ID })

      act(() => selection.select(entityId))

      expect(surfaceSelection.getActiveSurface()).toBeNull()
    },
  )

  it('keeps the active surface when the selection becomes empty', () => {
    const { selection, surfaceSelection } = mountBridge()
    act(() => selection.select('chair-1'))
    surfaceSelection.select(wallFace('w1', 'right'))

    act(() => selection.clear())

    expect(surfaceSelection.getActiveSurface()).toEqual(wallFace('w1', 'right'))
  })

  it('keeps the active surface when more than one entity becomes the selection', () => {
    const { selection, surfaceSelection } = mountBridge()
    surfaceSelection.select(wallFace('w1', 'right'))

    act(() => selection.setSelection(['chair-1', wallNodeId('w2')]))

    expect(surfaceSelection.getActiveSurface()).toEqual(wallFace('w1', 'right'))
  })

  it('does not override a surface chosen after the selection when the scene graph changes', () => {
    const { selection, surfaceSelection, session } = mountBridge()
    act(() => selection.select('chair-1'))
    surfaceSelection.select(wallFace('w9', 'left'))

    act(() => session.dispatch(addWall(FLOOR_ID, { x: 0, y: 0 }, { x: 1000, y: 1000 })))

    expect(surfaceSelection.getActiveSurface()).toEqual(wallFace('w9', 'left'))
  })
})
