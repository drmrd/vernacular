import { describe, it, expect } from 'vitest'
import { WALL_NODE_PREFIX, type SurfaceRef } from '../../core'
import { isSurfaceOfEntity, wallFaceForSelection } from './entity-surface'

const wallNodeId = (id: string): string => `${WALL_NODE_PREFIX}${id}`

describe('wallFaceForSelection', () => {
  it('returns the first face of the one selected wall', () => {
    const ref = wallFaceForSelection(new Set([wallNodeId('abc')]))
    expect(ref).toEqual({ kind: 'wall-face', wallId: 'abc', side: 'left' })
  })

  it('returns null when nothing is selected', () => {
    expect(wallFaceForSelection(new Set())).toBeNull()
  })

  it('returns null when several entities are selected', () => {
    expect(wallFaceForSelection(new Set([wallNodeId('a'), wallNodeId('b')]))).toBeNull()
  })

  it('returns null when the one selected entity is not a wall', () => {
    expect(wallFaceForSelection(new Set(['room:xyz']))).toBeNull()
  })
})

describe('isSurfaceOfEntity', () => {
  const left: SurfaceRef = { kind: 'wall-face', wallId: 'w1', side: 'left' }
  const right: SurfaceRef = { kind: 'wall-face', wallId: 'w1', side: 'right' }
  const floor: SurfaceRef = { kind: 'floor', floorId: 'f1' }
  const ceiling: SurfaceRef = { kind: 'ceiling', floorId: 'f1' }

  it('is true for both sides of the wall that the entity names', () => {
    expect(isSurfaceOfEntity(left, wallNodeId('w1'))).toBe(true)
    expect(isSurfaceOfEntity(right, wallNodeId('w1'))).toBe(true)
  })

  it('is false for a face of another wall', () => {
    expect(isSurfaceOfEntity(left, wallNodeId('w2'))).toBe(false)
  })

  it('is false for a floor or ceiling surface with a wall entity', () => {
    expect(isSurfaceOfEntity(floor, wallNodeId('f1'))).toBe(false)
    expect(isSurfaceOfEntity(ceiling, wallNodeId('f1'))).toBe(false)
  })

  it.each(['room:w1', 'opening:w1', 'furniture:w1'])(
    'is false for the non-wall entity %s',
    (entityId) => {
      expect(isSurfaceOfEntity(left, entityId)).toBe(false)
      expect(isSurfaceOfEntity(floor, entityId)).toBe(false)
    },
  )

  it('is false for an entity id that only starts like a wall id', () => {
    expect(isSurfaceOfEntity(left, 'wallpaper:w1')).toBe(false)
  })
})
