// The made-up table names its variants Union.tag, which is not camelCase by design.
/* eslint-disable @typescript-eslint/naming-convention */
import { describe, expect, it } from 'vitest'
import type { KnownKeyTable, KnownValue } from '../../index'
import { graftWithTable } from './graft'

const UNKNOWN_KEY = 'keyFromANewerBuild'

function objectAt(type: string): KnownValue {
  return { kind: 'object', type }
}

const FIGURE: KnownValue = {
  kind: 'union',
  tag: 'type',
  variants: [
    { value: 'round', type: 'Figure.round' },
    { value: 'square', type: 'Figure.square' },
  ],
}
const GEM: KnownValue = {
  kind: 'union',
  tag: 'cut',
  variants: [
    { value: 'cabochon', type: 'Gem.cabochon' },
    { value: 'facet', type: 'Gem.facet' },
  ],
}
const MIXED: KnownValue = {
  kind: 'union',
  tag: 'kind',
  variants: [
    { value: 'structured', type: 'Mixed.structured' },
    { value: 'plain', type: 'Mixed.plain' },
  ],
}

const TABLE: KnownKeyTable = {
  Slot: {
    keys: { id: { kind: 'leaf' }, figure: FIGURE },
    optional: [],
  },
  Tray: {
    keys: { slots: { kind: 'array', item: objectAt('Slot') } },
    optional: [],
  },
  'Figure.round': {
    keys: { type: { kind: 'leaf' }, radius: { kind: 'leaf' }, label: { kind: 'leaf' }, inner: GEM },
    optional: ['label', 'inner'],
  },
  'Figure.square': {
    keys: { type: { kind: 'leaf' }, side: { kind: 'leaf' } },
    optional: [],
  },
  'Gem.cabochon': { keys: { cut: { kind: 'leaf' }, dome: { kind: 'leaf' } }, optional: [] },
  'Gem.facet': { keys: { cut: { kind: 'leaf' }, facets: { kind: 'leaf' } }, optional: [] },
  Payload: {
    keys: { size: { kind: 'leaf' }, note: { kind: 'leaf' } },
    optional: ['note'],
  },
  'Mixed.structured': {
    keys: { kind: { kind: 'leaf' }, payload: objectAt('Payload') },
    optional: [],
  },
  'Mixed.plain': {
    keys: { kind: { kind: 'leaf' }, payload: { kind: 'leaf' } },
    optional: [],
  },
}

function graftFigure(previous: unknown, next: unknown): unknown {
  return graftWithTable(previous, next, { table: TABLE, at: FIGURE })
}

function ownKeyValue(value: unknown, key: string): unknown {
  return Object.getOwnPropertyDescriptor(value, key)?.value
}

describe('graftWithTable a union value whose tag names no variant', () => {
  const previous = { type: 'round', radius: 1, side: 2, label: 'L', [UNKNOWN_KEY]: 'kept' }

  it('replaces the previous value in full when the tag differs and names no variant', () => {
    expect(graftFigure(previous, { type: 'triangle' })).toEqual({ type: 'triangle' })
  })

  it.each([[42], [null], [true], [['round']]])(
    'replaces the previous value in full when the tag value %j is not a string',
    (tag) => {
      expect(graftFigure(previous, { type: tag })).toEqual({ type: tag })
    },
  )
})

const NOT_OBJECTS: ReadonlyArray<[string, unknown]> = [
  ['null', null],
  ['an array', [1, 2]],
  ['a string', 'round'],
]
const OBJECT_VALUE = { type: 'round', radius: 1, [UNKNOWN_KEY]: 'kept' }

describe('graftWithTable a union position that holds no object', () => {
  it.each(NOT_OBJECTS)('returns the next value unchanged when it is %s', (_label, next) => {
    expect(graftFigure(OBJECT_VALUE, next)).toEqual(next)
  })

  it.each(NOT_OBJECTS)('returns the next object unchanged when the previous is %s', (_l, prev) => {
    const next = { type: 'square', side: 3 }
    expect(graftFigure(prev, next)).toEqual(next)
  })

  it.each(NOT_OBJECTS)('returns the next value unchanged when both are %s', (_label, value) => {
    expect(graftFigure(value, value)).toEqual(value)
  })
})

describe('graftWithTable a union nested in an array item or in another union', () => {
  it('keeps a dropped variant key dropped and an unknown key on a union inside an array item', () => {
    const was = { id: 's1', figure: { type: 'round', radius: 1, label: 'L', [UNKNOWN_KEY]: 'k' } }
    const now = { id: 's1', figure: { type: 'round', radius: 2 } }
    const grafted = graftWithTable(
      { slots: [was] },
      { slots: [now] },
      { table: TABLE, at: objectAt('Tray') },
    )
    expect(grafted).toEqual({
      slots: [{ id: 's1', figure: { type: 'round', radius: 2, [UNKNOWN_KEY]: 'k' } }],
    })
  })

  it('keeps a dropped variant key dropped and an unknown key on a union inside a variant', () => {
    const was = { type: 'round', radius: 1, inner: { cut: 'facet', facets: 6, [UNKNOWN_KEY]: 'k' } }
    const now = { type: 'round', radius: 1, inner: { cut: 'facet' } }
    expect(graftFigure(was, now)).toEqual({
      type: 'round',
      radius: 1,
      inner: { cut: 'facet', [UNKNOWN_KEY]: 'k' },
    })
  })
})

describe('graftWithTable a union value key named like an inherited property', () => {
  it.each(['constructor', 'toString'])(
    'restores a previous-only key named %s as an own key',
    (name) => {
      const previous = { type: 'square', side: 3, [name]: { depth: { value: 1 } } }
      const grafted = graftFigure(previous, { type: 'square', side: 3 })
      expect(Object.hasOwn(grafted as object, name)).toBe(true)
      expect(ownKeyValue(grafted, name)).toEqual({ depth: { value: 1 } })
    },
  )

  it('restores a previous-only key named __proto__ as an own key', () => {
    const previous: unknown = JSON.parse(
      '{"type":"square","side":3,"__proto__":{"fromANewerBuild":true}}',
    )
    const grafted = graftFigure(previous, { type: 'square', side: 3 })
    expect(Object.hasOwn(grafted as object, '__proto__')).toBe(true)
    expect(Object.getPrototypeOf(grafted)).toBe(Object.prototype)
    expect(ownKeyValue(grafted, '__proto__')).toEqual({ fromANewerBuild: true })
  })
})

describe('graftWithTable a union value whose variant changes or whose tag key is removed', () => {
  it('does not carry over an unknown key of the previous value when the variant changes', () => {
    const previous = { type: 'round', radius: 1, label: 'L', [UNKNOWN_KEY]: 'kept' }
    const next = { type: 'square', side: 2 }
    expect(graftFigure(previous, next)).toEqual(next)
  })

  it('keeps the tag key removed from the next value', () => {
    const grafted = graftFigure({ type: 'square', side: 3 }, { side: 4 })
    expect(grafted).toEqual({ side: 4 })
  })

  it('keeps the tag key removed and does not restore an unknown key either', () => {
    const previous = { type: 'square', side: 3, [UNKNOWN_KEY]: 'kept' }
    expect(graftFigure(previous, { side: 4 })).toEqual({ side: 4 })
  })
})

describe('graftWithTable two variants that define one key with different kinds', () => {
  function graftMixed(previous: unknown, next: unknown): unknown {
    return graftWithTable(previous, next, { table: TABLE, at: MIXED })
  }

  it('grafts the key by the kind of the shared variant, so a dropped nested key stays dropped', () => {
    const previous = { kind: 'structured', payload: { size: 1, note: 'old', [UNKNOWN_KEY]: 'k' } }
    const next = { kind: 'structured', payload: { size: 2 } }
    expect(graftMixed(previous, next)).toEqual({
      kind: 'structured',
      payload: { size: 2, [UNKNOWN_KEY]: 'k' },
    })
  })

  it('replaces the value in full when the variant changes, so no nested key is carried over', () => {
    const previous = { kind: 'plain', payload: { size: 1, note: 'old', [UNKNOWN_KEY]: 'k' } }
    const next = { kind: 'structured', payload: { size: 2 } }
    expect(graftMixed(previous, next)).toEqual(next)
  })

  it('takes the key from the next value as it is when the next variant holds a plain value', () => {
    const previous = { kind: 'structured', payload: { size: 1, note: 'old' } }
    const next = { kind: 'plain', payload: 'text' }
    expect(graftMixed(previous, next)).toEqual(next)
  })
})
