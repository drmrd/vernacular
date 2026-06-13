import { describe, expect, it } from 'vitest'
import { getEntry } from './registry'
import { ELEMENT_TYPE_REGISTRY_VERSION, builtinElementTypes } from './element-types'

describe('builtin element types', () => {
  it('seeds a straight wall and a single-swing door', () => {
    expect(getEntry(builtinElementTypes, 'straight-wall')?.category).toBe('wall')
    expect(getEntry(builtinElementTypes, 'single-swing-door')?.category).toBe('opening')
    expect(builtinElementTypes.version).toBe(ELEMENT_TYPE_REGISTRY_VERSION)
  })

  it('wires each entry to its 2D symbol and 3D builder', () => {
    const wall = getEntry(builtinElementTypes, 'straight-wall')
    expect(wall?.plan2D.symbol).toBe('wall-line')
    expect(wall?.scene3D.builder).toBe('extruded-wall')

    const door = getEntry(builtinElementTypes, 'single-swing-door')
    expect(door?.plan2D.symbol).toBe('door-swing')
    expect(door?.scene3D.builder).toBe('door-frame')
  })

  it('exposes the opening type parameters for each registered opening', () => {
    const cases = [
      {
        id: 'single-swing-door',
        symbol: 'door-swing',
        opening: { family: 'swing', defaultWidth: 813, defaultHeight: 2032, defaultSillHeight: 0 },
      },
      {
        id: 'double-swing-door',
        symbol: 'door-swing',
        opening: { family: 'swing', double: true, defaultWidth: 1626 },
      },
      { id: 'pocket-door', symbol: 'door-slide', opening: { family: 'slide' } },
      { id: 'bifold-door', symbol: 'door-fold', opening: { family: 'fold' } },
      { id: 'pivot-door', symbol: 'door-pivot', opening: { family: 'pivot' } },
      { id: 'cased-opening', symbol: 'cased-opening', opening: { family: 'cased' } },
      {
        id: 'double-hung-window',
        symbol: 'window-fixed',
        opening: {
          family: 'window-fixed',
          defaultWidth: 900,
          defaultHeight: 1200,
          defaultSillHeight: 900,
        },
      },
      {
        id: 'casement-window',
        symbol: 'window-crank',
        opening: { family: 'window-crank' },
      },
    ] as const

    for (const expected of cases) {
      const entry = getEntry(builtinElementTypes, expected.id)
      expect(entry?.category).toBe('opening')
      expect(entry?.plan2D.symbol).toBe(expected.symbol)
      expect(entry?.opening).toMatchObject(expected.opening)
    }

    expect(ELEMENT_TYPE_REGISTRY_VERSION).toBe(4)
  })

  it('marks every opening element type with a rectangular void contour', () => {
    const openings = Object.values(builtinElementTypes.entries).filter(
      (entry) => entry.category === 'opening',
    )
    expect(openings.length).toBeGreaterThan(0)

    for (const entry of openings) {
      expect(entry.scene3D.voidContour).toBe('rectangular')
    }
  })

  it('leaves the wall and stair types without a void contour', () => {
    const wall = getEntry(builtinElementTypes, 'straight-wall')
    expect(wall?.category).toBe('wall')
    expect(wall?.scene3D.voidContour).toBeUndefined()

    const stair = getEntry(builtinElementTypes, 'straight-stair')
    expect(stair?.category).toBe('stair')
    expect(stair?.scene3D.voidContour).toBeUndefined()
  })
})

describe('stair element type', () => {
  it('registers a straight stair in the stair category with a stair plan symbol', () => {
    const stair = getEntry(builtinElementTypes, 'straight-stair')
    expect(stair?.category).toBe('stair')
    expect(stair?.plan2D.symbol).toBe('stair-run')
  })
})
