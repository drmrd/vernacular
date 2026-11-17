// The made-up table names its variants Union.tag, which is not camelCase by design.
/* eslint-disable @typescript-eslint/naming-convention */
import { describe, expect, it } from 'vitest'
import { KNOWN_KEYS, KNOWN_ROOT_TYPE, type KnownKeyTable, type KnownValue } from '../../index'
import { graftWithTable } from './graft'

const UNKNOWN_KEY = 'keyFromANewerBuild'

const ASSET = { scope: 'project', contentHash: 'sha256-aaaa' }
const OTHER_ASSET = { scope: 'project', contentHash: 'sha256-bbbb' }

function graftAtRoot(previous: unknown, next: unknown): unknown {
  return graftWithTable(previous, next, {
    table: KNOWN_KEYS,
    at: { kind: 'object', type: KNOWN_ROOT_TYPE },
  })
}

function documentWithSource(source: unknown): unknown {
  return { floors: [{ id: 'f1', underlays: [{ id: 'u1', source }] }] }
}

function documentWithPaint(treatment: unknown): unknown {
  return { paint: { s1: treatment } }
}

const COLOR = { r: 1, g: 0, b: 0 }
const SOLID = { kind: 'solid', color: COLOR, finishId: 'matte' }
const PATTERN = { kind: 'pattern', patternId: 'herringbone', scale: 100, colors: [] }
const RASTER = { kind: 'raster', image: ASSET }
const SCENE = { kind: 'scene', scene: ASSET }

describe('graftWithTable a key that only another variant defines, on a value of the same variant', () => {
  it('restores scale on a solid paint entry, where only the pattern variant knows it', () => {
    const was = { ...SOLID, scale: 2 }
    const now = { ...SOLID, color: { r: 0, g: 0, b: 1 } }
    const grafted = graftAtRoot(documentWithPaint(was), documentWithPaint(now))
    expect(grafted).toEqual(documentWithPaint({ ...now, scale: 2 }))
  })

  it('restores page on a raster underlay source, where only the document variant knows it', () => {
    const was = { ...RASTER, page: 3 }
    const now = { ...RASTER, image: OTHER_ASSET }
    const grafted = graftAtRoot(documentWithSource(was), documentWithSource(now))
    expect(grafted).toEqual(documentWithSource({ ...now, page: 3 }))
  })
})

const SHAPE: KnownValue = {
  kind: 'union',
  tag: 'type',
  variants: [
    { value: 'round', type: 'Shape.round' },
    { value: 'square', type: 'Shape.square' },
    { value: 'oval', type: 'Shape.oval' },
  ],
}

const MADE_UP_TABLE: KnownKeyTable = {
  'Shape.round': { keys: { type: { kind: 'leaf' }, radius: { kind: 'leaf' } }, optional: [] },
  'Shape.square': { keys: { type: { kind: 'leaf' }, side: { kind: 'leaf' } }, optional: [] },
  'Shape.oval': {
    keys: { type: { kind: 'leaf' }, width: { kind: 'leaf' }, side: { kind: 'leaf' } },
    optional: ['side'],
  },
}

function graftShape(previous: unknown, next: unknown): unknown {
  return graftWithTable(previous, next, { table: MADE_UP_TABLE, at: SHAPE })
}

describe('graftWithTable a made-up union where other variants define a key of the previous value', () => {
  it('restores a key that another variant defines when the variant stays', () => {
    const previous = { type: 'round', radius: 1, side: 4 }
    expect(graftShape(previous, { type: 'round', radius: 2 })).toEqual({
      type: 'round',
      radius: 2,
      side: 4,
    })
  })

  it('restores a key that the other variant defines and the previous value carries', () => {
    const previous = { type: 'round', radius: 1, width: 5 }
    expect(graftShape(previous, { type: 'round', radius: 1 })).toEqual(previous)
  })

  it('still drops a known key of the same variant that the next value dropped', () => {
    const previous = { type: 'oval', width: 5, side: 4 }
    expect(graftShape(previous, { type: 'oval', width: 6 })).toEqual({ type: 'oval', width: 6 })
  })
})

describe('graftWithTable a variant change with an unknown key on the previous value', () => {
  it('replaces a paint entry in full', () => {
    const was = { ...SOLID, [UNKNOWN_KEY]: 'kept' }
    const grafted = graftAtRoot(documentWithPaint(was), documentWithPaint(PATTERN))
    expect(grafted).toEqual(documentWithPaint(PATTERN))
  })

  it('replaces an underlay source in full', () => {
    const was = { ...RASTER, [UNKNOWN_KEY]: 'kept' }
    const grafted = graftAtRoot(documentWithSource(was), documentWithSource(SCENE))
    expect(grafted).toEqual(documentWithSource(SCENE))
  })

  it('replaces a value of the made-up union in full', () => {
    const previous = { type: 'round', radius: 1, [UNKNOWN_KEY]: 'kept' }
    const next = { type: 'square', side: 2 }
    expect(graftShape(previous, next)).toEqual(next)
  })
})

describe('graftWithTable the same tag on both sides when the table has no variant for it', () => {
  it('restores every previous-only key, known to another variant or not', () => {
    const previous = { type: 'hexagon', radius: 1, side: 2, [UNKNOWN_KEY]: 'kept', edge: 6 }
    const next = { type: 'hexagon', edge: 7 }
    expect(graftShape(previous, next)).toEqual({
      type: 'hexagon',
      radius: 1,
      side: 2,
      [UNKNOWN_KEY]: 'kept',
      edge: 7,
    })
  })

  it('restores every previous-only key of a paint entry from a newer variant', () => {
    const was = { kind: 'gradient', stops: [1, 2], angle: 45 }
    const now = { kind: 'gradient', angle: 90 }
    const grafted = graftAtRoot(documentWithPaint(was), documentWithPaint(now))
    expect(grafted).toEqual(documentWithPaint({ kind: 'gradient', stops: [1, 2], angle: 90 }))
  })
})

describe('graftWithTable a tagged-union value whose tag is missing on one side', () => {
  it('returns the next value unchanged when the next value has no tag', () => {
    const previous = { ...SOLID, [UNKNOWN_KEY]: 'kept' }
    const next = { color: COLOR }
    expect(graftAtRoot(documentWithPaint(previous), documentWithPaint(next))).toEqual(
      documentWithPaint(next),
    )
  })

  it('returns the next value unchanged when the previous value has no tag', () => {
    const previous = { color: COLOR, [UNKNOWN_KEY]: 'kept', scale: 2 }
    expect(graftAtRoot(documentWithPaint(previous), documentWithPaint(SOLID))).toEqual(
      documentWithPaint(SOLID),
    )
  })

  it('returns the next value unchanged in the made-up union when either tag is missing', () => {
    const next = { radius: 2 }
    expect(graftShape({ type: 'round', radius: 1, [UNKNOWN_KEY]: 'kept' }, next)).toEqual(next)
    const squareNext = { type: 'square', side: 2 }
    expect(graftShape({ side: 1, [UNKNOWN_KEY]: 'kept' }, squareNext)).toEqual(squareNext)
  })
})
