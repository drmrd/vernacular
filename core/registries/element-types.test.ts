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
          family: 'window-hung',
          defaultWidth: 900,
          defaultHeight: 1200,
          defaultSillHeight: 900,
        },
      },
      {
        id: 'casement-window',
        symbol: 'window-crank',
        opening: { family: 'window-crank', hingeEdge: 'jamb' },
      },
    ] as const

    for (const expected of cases) {
      const entry = getEntry(builtinElementTypes, expected.id)
      expect(entry?.category).toBe('opening')
      expect(entry?.plan2D.symbol).toBe(expected.symbol)
      expect(entry?.opening).toMatchObject(expected.opening)
    }

    expect(ELEMENT_TYPE_REGISTRY_VERSION).toBe(6)
  })

  it('marks every conventional opening element type with a rectangular void contour', () => {
    const curvedHeads = new Set(['arched-window', 'round-top-window', 'lancet-window'])
    const openings = Object.values(builtinElementTypes.entries).filter(
      (entry) => entry.category === 'opening',
    )
    expect(openings.length).toBeGreaterThan(0)

    for (const entry of openings) {
      if (curvedHeads.has(entry.id)) continue
      expect(entry.scene3D.voidContour).toBe('rectangular')
    }
  })

  it('registers curved-head window types carrying their head shape as the void contour', () => {
    const cases = [
      { id: 'arched-window', voidContour: 'arched' },
      { id: 'round-top-window', voidContour: 'round' },
      { id: 'lancet-window', voidContour: 'lancet' },
    ] as const

    for (const { id, voidContour } of cases) {
      const entry = getEntry(builtinElementTypes, id)
      expect(entry?.category).toBe('opening')
      expect(entry?.plan2D.symbol).toBe('window-fixed')
      expect(entry?.scene3D.voidContour).toBe(voidContour)
      expect(entry?.scene3D.fill).toBe('window-sash')
    }
  })

  it('names the three-dimensional fill kind for each opening family', () => {
    for (const id of ['single-swing-door', 'double-swing-door', 'pocket-door'] as const) {
      expect(getEntry(builtinElementTypes, id)?.scene3D.fill).toBe('door-leaf')
    }

    for (const id of ['double-hung-window', 'casement-window'] as const) {
      expect(getEntry(builtinElementTypes, id)?.scene3D.fill).toBe('window-sash')
    }

    expect(getEntry(builtinElementTypes, 'cased-opening')?.scene3D.fill).toBeUndefined()
  })

  it('leaves the wall and stair types without a fill kind', () => {
    expect(getEntry(builtinElementTypes, 'straight-wall')?.scene3D.fill).toBeUndefined()
    expect(getEntry(builtinElementTypes, 'straight-stair')?.scene3D.fill).toBeUndefined()
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

describe('operable window families', () => {
  it('splits the hung and sliding windows into their own motion families', () => {
    const families: ReadonlyArray<readonly [string, string]> = [
      ['double-hung-window', 'window-hung'],
      ['single-hung-window', 'window-hung'],
      ['sliding-window', 'window-slide'],
    ]
    for (const [id, family] of families) {
      expect(getEntry(builtinElementTypes, id)?.opening?.family).toBe(family)
    }
  })

  it('tags each crank window with its hinge edge', () => {
    const hingeEdges: ReadonlyArray<readonly [string, string]> = [
      ['casement-window', 'jamb'],
      ['awning-window', 'head'],
      ['hopper-window', 'sill'],
    ]
    for (const [id, hingeEdge] of hingeEdges) {
      const entry = getEntry(builtinElementTypes, id)
      expect(entry?.opening?.family).toBe('window-crank')
      expect(entry?.opening?.hingeEdge).toBe(hingeEdge)
    }
  })

  it('keeps the truly fixed windows in the window-fixed family', () => {
    const fixed = [
      'picture-window',
      'transom-window',
      'sidelight-window',
      'arched-window',
      'round-top-window',
      'lancet-window',
    ]
    for (const id of fixed) {
      expect(getEntry(builtinElementTypes, id)?.opening?.family).toBe('window-fixed')
    }
  })
})

describe('stair element type', () => {
  it('registers a straight stair in the stair category with a stair plan symbol', () => {
    const stair = getEntry(builtinElementTypes, 'straight-stair')
    expect(stair?.category).toBe('stair')
    expect(stair?.plan2D.symbol).toBe('stair-run')
  })
})
