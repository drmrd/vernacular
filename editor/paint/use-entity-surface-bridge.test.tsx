import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import {
  SelectionProvider,
  SurfaceSelectionProvider,
  createSelectionStore,
  createSurfaceSelectionStore,
} from '../../bridge'
import { WALL_NODE_PREFIX, type SurfaceRef } from '../../core'
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

function mountBridge() {
  const selection = createSelectionStore()
  const surfaceSelection = createSurfaceSelectionStore()
  render(
    <SelectionProvider store={selection}>
      <SurfaceSelectionProvider store={surfaceSelection}>
        <Bridge />
      </SurfaceSelectionProvider>
    </SelectionProvider>,
  )
  return { selection, surfaceSelection }
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
  const floorSurface: SurfaceRef = { kind: 'floor', floorId: 'f1' }

  it('leaves the floor surface alone when the room of that floor becomes the selection', () => {
    const { selection, surfaceSelection } = mountBridge()
    surfaceSelection.select(floorSurface)

    act(() => selection.select('room:r1'))

    expect(surfaceSelection.getActiveSurface()).toEqual(floorSurface)
  })

  it('sets the left face when a wall becomes the selection', () => {
    const { selection, surfaceSelection } = mountBridge()
    surfaceSelection.select(floorSurface)

    act(() => selection.select(wallNodeId('w1')))

    expect(surfaceSelection.getActiveSurface()).toEqual(wallFace('w1', 'left'))
  })
})
