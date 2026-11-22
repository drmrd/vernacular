import { describe, it, expect } from 'vitest'
import { WALL_NODE_PREFIX, type RoomSceneNode, type SurfaceRef } from '../../core'
import { isSurfaceOfEntity, paintTargetForSelection, wallFaceForSelection } from './entity-surface'

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

describe('paintTargetForSelection', () => {
  const room: RoomSceneNode = {
    id: 'room:r1',
    kind: 'room',
    floorId: 'g',
    polygon: [],
    clearPolygon: [],
    area: 0,
  }
  const rooms = [room]
  const leftOfW1: SurfaceRef = { kind: 'wall-face', wallId: 'w1', side: 'left' }
  const rightOfW1: SurfaceRef = { kind: 'wall-face', wallId: 'w1', side: 'right' }
  const leftOfW2: SurfaceRef = { kind: 'wall-face', wallId: 'w2', side: 'left' }
  const floorOfG: SurfaceRef = { kind: 'floor', floorId: 'g' }
  const ceilingOfG: SurfaceRef = { kind: 'ceiling', floorId: 'g' }
  const floorOfUpper: SurfaceRef = { kind: 'floor', floorId: 'upper' }

  it('keeps a face of the one selected wall', () => {
    const change = paintTargetForSelection(new Set([wallNodeId('w1')]), rightOfW1, rooms)
    expect(change).toEqual({ kind: 'keep' })
  })

  it.each([
    ['a face of another wall', leftOfW2],
    ['the floor of a room', floorOfG],
    ['no surface', null],
  ])(
    'selects the left face of the one selected wall when the active surface is %s',
    (_, active) => {
      const change = paintTargetForSelection(new Set([wallNodeId('w1')]), active, rooms)
      expect(change).toEqual({ kind: 'select', surface: leftOfW1 })
    },
  )

  it.each([
    ['floor', floorOfG],
    ['ceiling', ceilingOfG],
  ])('keeps the %s of the one selected room when that surface is active', (_, active) => {
    const change = paintTargetForSelection(new Set([room.id]), active, rooms)
    expect(change).toEqual({ kind: 'keep' })
  })

  it.each([
    ['no surface', null],
    ['a wall face', leftOfW1],
    ['the floor of another storey', floorOfUpper],
  ])('selects the floor of the one selected room when the active surface is %s', (_, active) => {
    const change = paintTargetForSelection(new Set([room.id]), active, rooms)
    expect(change).toEqual({ kind: 'select', surface: floorOfG })
  })

  it('keeps the active surface when the one selected room is not in the scene graph', () => {
    const change = paintTargetForSelection(new Set(['room:missing']), leftOfW1, rooms)
    expect(change).toEqual({ kind: 'keep' })
  })

  it.each(['chair-1', 'opening:o1', 'stair:s1'])(
    'clears the paint target when the one selected entity is %s, which has no paintable face',
    (entityId) => {
      const change = paintTargetForSelection(new Set([entityId]), floorOfG, rooms)
      expect(change).toEqual({ kind: 'clear' })
    },
  )

  it('keeps the active surface when nothing is selected', () => {
    expect(paintTargetForSelection(new Set(), floorOfG, rooms)).toEqual({ kind: 'keep' })
  })

  it('keeps the active surface when several entities are selected', () => {
    const change = paintTargetForSelection(new Set(['chair-1', room.id]), floorOfG, rooms)
    expect(change).toEqual({ kind: 'keep' })
  })
})
