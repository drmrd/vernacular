// The made-up table names its types in PascalCase, as the generated table does.
/* eslint-disable @typescript-eslint/naming-convention */
import { describe, expect, it } from 'vitest'
import type { KnownKeyTable, KnownType, KnownValue } from '../../index'
import { graftWithTable } from './graft'

const UNKNOWN_KEY = 'keyFromANewerBuild'

function objectAt(type: string): KnownValue {
  return { kind: 'object', type }
}

const TABLE: KnownKeyTable = {
  Cabinet: {
    keys: {
      child: objectAt('Drawer'),
      drawers: { kind: 'array', item: objectAt('Drawer') },
      crates: { kind: 'map', value: objectAt('Drawer') },
    },
    optional: ['child', 'drawers', 'crates'],
  },
  Drawer: {
    keys: { id: { kind: 'leaf' }, label: { kind: 'leaf' } },
    optional: ['label'],
  },
}

function graftCabinet(previous: unknown, next: unknown): unknown {
  return graftWithTable(previous, next, { table: TABLE, at: objectAt('Cabinet') })
}

function graftDrawers(previous: unknown[], next: unknown[]): unknown {
  return graftCabinet({ drawers: previous }, { drawers: next })
}

interface PositionCase {
  readonly kind: string
  readonly key: string
  readonly collection: unknown
  readonly scalar: unknown
}

const COLLECTIONS: ReadonlyArray<Omit<PositionCase, 'scalar'>> = [
  { kind: 'an object', key: 'child', collection: { id: 'd1', label: 'one' } },
  { kind: 'an array', key: 'drawers', collection: [{ id: 'd1', label: 'one' }] },
  { kind: 'a map', key: 'crates', collection: { c1: { id: 'd1', label: 'one' } } },
]
const POSITION_CASES: PositionCase[] = COLLECTIONS.flatMap((position) =>
  ['text', 5].map((scalar) => ({ ...position, scalar })),
)

describe('graftWithTable a scalar on one side and a collection on the other', () => {
  it.each(POSITION_CASES)(
    'returns the next scalar $scalar unchanged at $kind position $key that held a collection',
    ({ key, collection, scalar }) => {
      const grafted = graftCabinet({ [key]: collection }, { [key]: scalar })
      expect(grafted).toEqual({ [key]: scalar })
    },
  )

  it.each(POSITION_CASES)(
    'returns the next collection unchanged at $kind position $key that held the scalar $scalar',
    ({ key, collection, scalar }) => {
      const grafted = graftCabinet({ [key]: scalar }, { [key]: collection })
      expect(grafted).toEqual({ [key]: collection })
    },
  )
})

describe('graftWithTable an array of items with an id', () => {
  it('does not restore an item that only the previous array has', () => {
    const previous = [{ id: 'd1' }, { id: 'd2', [UNKNOWN_KEY]: 'gone with the item' }]
    expect(graftDrawers(previous, [{ id: 'd1' }])).toEqual({ drawers: [{ id: 'd1' }] })
  })

  it('keeps an item that only the next array has as it is', () => {
    const previous = [{ id: 'd1', [UNKNOWN_KEY]: 'kept' }]
    const next = [{ id: 'd1' }, { id: 'd2', label: 'new' }]
    expect(graftDrawers(previous, next)).toEqual({
      drawers: [
        { id: 'd1', [UNKNOWN_KEY]: 'kept' },
        { id: 'd2', label: 'new' },
      ],
    })
  })

  it('keeps the order of the next array and still grafts a moved item from its previous self', () => {
    const previous = [
      { id: 'd1', [UNKNOWN_KEY]: 'one' },
      { id: 'd2', [UNKNOWN_KEY]: 'two' },
      { id: 'd3', label: 'cleared' },
    ]
    const next = [{ id: 'd3' }, { id: 'd1' }, { id: 'd2' }]
    expect(graftDrawers(previous, next)).toEqual({
      drawers: [
        { id: 'd3' },
        { id: 'd1', [UNKNOWN_KEY]: 'one' },
        { id: 'd2', [UNKNOWN_KEY]: 'two' },
      ],
    })
  })

  it('grafts from the first previous item when ids repeat in the previous array (present behavior)', () => {
    const previous = [
      { id: 'd1', [UNKNOWN_KEY]: 'first' },
      { id: 'd1', [UNKNOWN_KEY]: 'second' },
    ]
    expect(graftDrawers(previous, [{ id: 'd1' }])).toEqual({
      drawers: [{ id: 'd1', [UNKNOWN_KEY]: 'first' }],
    })
  })

  it('grafts every next item from the one previous item when ids repeat in the next array (present behavior)', () => {
    const previous = [{ id: 'd1', [UNKNOWN_KEY]: 'kept' }]
    const next = [{ id: 'd1' }, { id: 'd1', label: 'twin' }]
    expect(graftDrawers(previous, next)).toEqual({
      drawers: [
        { id: 'd1', [UNKNOWN_KEY]: 'kept' },
        { id: 'd1', label: 'twin', [UNKNOWN_KEY]: 'kept' },
      ],
    })
  })
})

describe('graftWithTable null or an array where the table expects an object', () => {
  const PREVIOUS = { id: 'd1', label: 'one', [UNKNOWN_KEY]: 'kept' }
  const NEXT = { id: 'd1' }
  const WRONG_SHAPES: ReadonlyArray<[string, unknown]> = [
    ['null', null],
    ['an array', [{ id: 'd1' }]],
  ]

  function graftDrawer(previous: unknown, next: unknown): unknown {
    return graftWithTable(previous, next, { table: TABLE, at: objectAt('Drawer') })
  }

  it.each(WRONG_SHAPES)('returns the next value unchanged when it is %s', (_label, next) => {
    expect(graftDrawer(PREVIOUS, next)).toEqual(next)
  })

  it.each(WRONG_SHAPES)('returns the next object unchanged when the previous is %s', (_l, prev) => {
    expect(graftDrawer(prev, NEXT)).toEqual(NEXT)
  })
})

describe('graftWithTable an object value whose type has no entry in the table', () => {
  it('restores every previous-only key, as if no key were known (present behavior)', () => {
    const previous = { id: 'x', [UNKNOWN_KEY]: 'kept', label: 'old' }
    const grafted = graftWithTable(previous, { id: 'x' }, { table: TABLE, at: objectAt('Missing') })
    expect(grafted).toEqual(previous)
  })
})

const INHERITED_NAMES = ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__']

describe('graftWithTable a type named like a property every object inherits', () => {
  it.each(INHERITED_NAMES)(
    'treats the object type %s as missing when the table has no own entry of that name',
    (name) => {
      const previous = { id: 'x', [UNKNOWN_KEY]: 'kept', label: 'old' }
      const grafted = graftWithTable(previous, { id: 'x' }, { table: TABLE, at: objectAt(name) })
      expect(grafted).toEqual(previous)
    },
  )

  it.each(INHERITED_NAMES)(
    'treats the union variant type %s as missing when the table has no own entry of that name',
    (name) => {
      const union: KnownValue = {
        kind: 'union',
        tag: 'kind',
        variants: [{ value: 'only', type: name }],
      }
      const previous = { kind: 'only', [UNKNOWN_KEY]: 'kept', label: 'old' }
      const grafted = graftWithTable(previous, { kind: 'only' }, { table: TABLE, at: union })
      expect(grafted).toEqual(previous)
    },
  )

  it('uses an own table entry named constructor, so a known key the next value dropped stays dropped', () => {
    const entry: KnownType = {
      keys: { id: { kind: 'leaf' }, label: { kind: 'leaf' } },
      optional: ['label'],
    }
    const table: KnownKeyTable = { constructor: entry }
    const previous = { id: 'x', label: 'old', [UNKNOWN_KEY]: 'kept' }
    const grafted = graftWithTable(previous, { id: 'x' }, { table, at: objectAt('constructor') })
    expect(grafted).toEqual({ id: 'x', [UNKNOWN_KEY]: 'kept' })
  })
})
