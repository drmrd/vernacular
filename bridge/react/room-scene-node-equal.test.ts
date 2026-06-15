import { describe, it, expect } from 'vitest'
import { roomSceneNodeEqual } from './room-scene-node-equal'
import type { RoomSceneNode } from '../../core'

// Derived room nodes have no source object: the deriver produces fresh arrays
// every derivation, so equality must compare the shell geometry by value, not by
// array reference. Named coordinate/area constants keep the literals out of the
// no-magic-numbers rule and document the square room these fixtures describe.
const SPAN = 4000
const AREA = SPAN * SPAN
const CEILING = 2700
const MOVED = 4500
const HOLE_INSET = 1000
const HOLE_SIDE = 2000

// A square outline whose corners are rebuilt as fresh objects on each call, so
// two builds share no array or point instance even when the numbers match.
function squareOutline(): RoomSceneNode['polygon'] {
  return [
    { x: 0, y: 0 },
    { x: SPAN, y: 0 },
    { x: SPAN, y: SPAN },
    { x: 0, y: SPAN },
  ]
}

function squareHole(): RoomSceneNode['polygon'] {
  return [
    { x: HOLE_INSET, y: HOLE_INSET },
    { x: HOLE_SIDE, y: HOLE_INSET },
    { x: HOLE_SIDE, y: HOLE_SIDE },
    { x: HOLE_INSET, y: HOLE_SIDE },
  ]
}

// A fully-populated room node whose every array is freshly allocated. Each call
// yields equal numbers in distinct instances so callers can mutate one copy and
// compare it against an untouched twin.
function roomNode(): RoomSceneNode {
  return {
    id: 'room:r',
    kind: 'room',
    floorId: 'g',
    polygon: squareOutline(),
    clearPolygon: squareOutline(),
    outerPolygon: squareOutline(),
    holes: [squareHole()],
    area: AREA,
    name: 'Parlor',
    ceilingHeight: CEILING,
  }
}

describe('roomSceneNodeEqual', () => {
  it('treats nodes with equal values held in distinct array instances as equal', () => {
    const a = roomNode()
    const b = roomNode()

    expect(a.polygon).not.toBe(b.polygon)
    expect(a.holes).not.toBe(b.holes)
    expect(roomSceneNodeEqual(a, b)).toBe(true)
  })

  it('treats a moved polygon point as unequal', () => {
    const a = roomNode()
    const b = roomNode()
    b.polygon[1] = { x: MOVED, y: 0 }

    expect(roomSceneNodeEqual(a, b)).toBe(false)
  })

  it('treats a moved clearPolygon point as unequal', () => {
    const a = roomNode()
    const b = roomNode()
    b.clearPolygon[1] = { x: MOVED, y: 0 }

    expect(roomSceneNodeEqual(a, b)).toBe(false)
  })

  it('treats a moved outerPolygon point as unequal', () => {
    const a = roomNode()
    const b = roomNode()
    b.outerPolygon = [
      { x: 0, y: 0 },
      { x: MOVED, y: 0 },
      { x: SPAN, y: SPAN },
      { x: 0, y: SPAN },
    ]

    expect(roomSceneNodeEqual(a, b)).toBe(false)
  })

  it('treats a present outerPolygon against an absent one as unequal', () => {
    const a = roomNode()
    const b = roomNode()
    delete b.outerPolygon

    expect(roomSceneNodeEqual(a, b)).toBe(false)
  })

  it('treats a moved hole ring point as unequal', () => {
    const a = roomNode()
    const b = roomNode()
    b.holes = [
      [
        { x: HOLE_INSET, y: HOLE_INSET },
        { x: MOVED, y: HOLE_INSET },
        { x: HOLE_SIDE, y: HOLE_SIDE },
        { x: HOLE_INSET, y: HOLE_SIDE },
      ],
    ]

    expect(roomSceneNodeEqual(a, b)).toBe(false)
  })

  it('treats a different number of hole rings as unequal', () => {
    const a = roomNode()
    const b = roomNode()
    b.holes = [squareHole(), squareHole()]

    expect(roomSceneNodeEqual(a, b)).toBe(false)
  })

  it('treats a present holes ring against an absent one as unequal', () => {
    const a = roomNode()
    const b = roomNode()
    delete b.holes

    expect(roomSceneNodeEqual(a, b)).toBe(false)
  })

  it('treats a different area as unequal', () => {
    const a = roomNode()
    const b = roomNode()
    b.area = AREA + 1

    expect(roomSceneNodeEqual(a, b)).toBe(false)
  })

  it('treats a different name as unequal', () => {
    const a = roomNode()
    const b = roomNode()
    b.name = 'Kitchen'

    expect(roomSceneNodeEqual(a, b)).toBe(false)
  })

  it('treats a present name against an absent one as unequal', () => {
    const a = roomNode()
    const b = roomNode()
    delete b.name

    expect(roomSceneNodeEqual(a, b)).toBe(false)
  })

  it('treats a different ceilingHeight as unequal', () => {
    const a = roomNode()
    const b = roomNode()
    b.ceilingHeight = CEILING + 1

    expect(roomSceneNodeEqual(a, b)).toBe(false)
  })

  it('treats a present ceilingHeight against an absent one as unequal', () => {
    const a = roomNode()
    const b = roomNode()
    delete b.ceilingHeight

    expect(roomSceneNodeEqual(a, b)).toBe(false)
  })

  it('treats the same id with otherwise equal fields as equal', () => {
    const a = roomNode()
    const b = roomNode()

    expect(a.id).toBe(b.id)
    expect(roomSceneNodeEqual(a, b)).toBe(true)
  })

  it('treats a different id as unequal', () => {
    const a = roomNode()
    const b = roomNode()
    b.id = 'room:other'

    expect(roomSceneNodeEqual(a, b)).toBe(false)
  })
})
