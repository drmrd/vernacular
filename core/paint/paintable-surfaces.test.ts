import { describe, expect, it } from 'vitest'
import { paintableSurfaces } from './paintable-surfaces'
import { surfaceKey } from '../model/paint'
import { createFloor, createWall } from '../model/factories'
import type { Floor } from '../model/types'

function floorWithTwoWalls(): Floor {
  const wallA = createWall({ x: 0, y: 0 }, { x: 1000, y: 0 }, { id: 'wall-a' })
  const wallB = createWall({ x: 1000, y: 0 }, { x: 1000, y: 1000 }, { id: 'wall-b' })
  return createFloor('Ground Floor', { id: 'floor-1', walls: [wallA, wallB] })
}

describe('paintableSurfaces', () => {
  it('yields four wall-face entries then two floor-ceiling entries for two walls', () => {
    const surfaces = paintableSurfaces(floorWithTwoWalls())
    expect(surfaces).toHaveLength(6)
    expect(surfaces.map((surface) => surface.group)).toEqual([
      'wall',
      'wall',
      'wall',
      'wall',
      'floor-ceiling',
      'floor-ceiling',
    ])
  })

  it('orders the wall faces as each wall left then right in floor.walls order', () => {
    const surfaces = paintableSurfaces(floorWithTwoWalls())
    expect(surfaces.slice(0, 4).map((surface) => surface.ref)).toEqual([
      { kind: 'wall-face', wallId: 'wall-a', side: 'left' },
      { kind: 'wall-face', wallId: 'wall-a', side: 'right' },
      { kind: 'wall-face', wallId: 'wall-b', side: 'left' },
      { kind: 'wall-face', wallId: 'wall-b', side: 'right' },
    ])
  })

  it('places the floor surface then the ceiling surface last', () => {
    const floor = floorWithTwoWalls()
    const surfaces = paintableSurfaces(floor)
    expect(surfaces.slice(4).map((surface) => surface.ref)).toEqual([
      { kind: 'floor', floorId: floor.id },
      { kind: 'ceiling', floorId: floor.id },
    ])
  })

  it('gives every entry a non-empty label with no duplicate labels', () => {
    const surfaces = paintableSurfaces(floorWithTwoWalls())
    for (const surface of surfaces) {
      expect(surface.label).toBeTypeOf('string')
      expect(surface.label.length).toBeGreaterThan(0)
    }
    const labels = surfaces.map((surface) => surface.label)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('produces a unique surfaceKey for every entry', () => {
    const surfaces = paintableSurfaces(floorWithTwoWalls())
    const keys = surfaces.map((surface) => surfaceKey(surface.ref))
    expect(new Set(keys).size).toBe(keys.length)
  })
})
