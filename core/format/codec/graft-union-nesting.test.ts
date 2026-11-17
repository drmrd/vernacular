// The made-up table names its variants Union.tag, which is not camelCase by design.
/* eslint-disable @typescript-eslint/naming-convention */
import { describe, expect, it } from 'vitest'
import type { KnownKeyTable, KnownValue } from '../../index'
import { graftWithTable } from './graft'

const UNKNOWN_KEY = 'keyFromANewerBuild'

const INNER: KnownValue = {
  kind: 'union',
  tag: 'cut',
  variants: [{ value: 'facet', type: 'Inner.facet' }],
}
const OUTER: KnownValue = {
  kind: 'union',
  tag: 'type',
  variants: [
    { value: 'left', type: 'Outer.left' },
    { value: 'right', type: 'Outer.right' },
  ],
}
const OPEN: KnownValue = {
  kind: 'union',
  tag: 'type',
  variants: [
    { value: 'left', type: 'Open.left' },
    { value: 'right', type: 'Open.right' },
  ],
}

const NESTED_KEYS = {
  type: { kind: 'leaf' },
  inner: INNER,
  items: { kind: 'array', item: INNER },
  byName: { kind: 'map', value: INNER },
} as const

const TABLE: KnownKeyTable = {
  'Inner.facet': {
    keys: { cut: { kind: 'leaf' }, id: { kind: 'leaf' }, facets: { kind: 'leaf' } },
    optional: [],
  },
  'Outer.left': { keys: NESTED_KEYS, optional: ['inner', 'items', 'byName'] },
  'Outer.right': { keys: NESTED_KEYS, optional: ['inner', 'items', 'byName'] },
  'Open.left': {
    keys: { type: { kind: 'leaf' }, extensions: { kind: 'opaque' } },
    optional: ['extensions'],
  },
  'Open.right': {
    keys: { type: { kind: 'leaf' }, extensions: { kind: 'opaque' } },
    optional: ['extensions'],
  },
}

function graftAt(at: KnownValue, previous: unknown, next: unknown): unknown {
  return graftWithTable(previous, next, { table: TABLE, at })
}

function facet(extra: object = {}): object {
  return { cut: 'facet', id: 'i1', facets: 6, ...extra }
}

describe('graftWithTable a previous tag that names no variant of the table', () => {
  it('returns the next value exactly when the next tag names a known variant', () => {
    const previous = { type: 'triangle', radius: 1, [UNKNOWN_KEY]: 'kept' }
    const next = { type: 'left', inner: facet() }
    expect(graftAt(OUTER, previous, next)).toEqual(next)
  })
})

describe('graftWithTable an outer union whose tag changes above an inner union with the same tag', () => {
  const shapes: ReadonlyArray<[string, (inner: object) => object]> = [
    ['a key', (inner) => ({ inner })],
    ['an array item', (inner) => ({ items: [inner] })],
    ['a map entry', (inner) => ({ byName: { a: inner } })],
  ]

  it.each(shapes)('replaces the whole outer value with the inner union in %s', (_l, place) => {
    const previous = { type: 'left', ...place(facet({ [UNKNOWN_KEY]: 'k' })) }
    const next = { type: 'right', ...place(facet()) }
    expect(graftAt(OUTER, previous, next)).toEqual(next)
  })

  it.each(shapes)('restores the inner unknown key when the outer tag stays, in %s', (_l, place) => {
    const previous = { type: 'left', ...place(facet({ [UNKNOWN_KEY]: 'k' })) }
    const next = { type: 'left', ...place(facet()) }
    expect(graftAt(OUTER, previous, next)).toEqual({
      type: 'left',
      ...place(facet({ [UNKNOWN_KEY]: 'k' })),
    })
  })
})

describe('graftWithTable an array item union without an id', () => {
  it('takes the next item as it is, so no previous-only key is restored', () => {
    const was = { cut: 'facet', facets: 6, [UNKNOWN_KEY]: 'k' }
    const now = { cut: 'facet', facets: 6 }
    const next = { type: 'left', items: [now] }
    expect(graftAt(OUTER, { type: 'left', items: [was] }, next)).toEqual(next)
  })
})

describe('graftWithTable an open map inside a union variant', () => {
  it('restores an extensions entry that only the previous value has when the tag stays', () => {
    const previous = { type: 'left', extensions: { kept: 1, other: 2 } }
    const next = { type: 'left', extensions: { other: 3 } }
    expect(graftAt(OPEN, previous, next)).toEqual({
      type: 'left',
      extensions: { kept: 1, other: 3 },
    })
  })

  it('does not carry the entry over when the tag changes', () => {
    const previous = { type: 'left', extensions: { kept: 1, other: 2 } }
    const next = { type: 'right', extensions: { other: 3 } }
    expect(graftAt(OPEN, previous, next)).toEqual(next)
  })
})

describe('graftWithTable an equal tag that is not a string and has no variant', () => {
  it.each([[null], [7]])('restores a previous-only key when both tags are %j', (tag) => {
    const previous = { type: tag, radius: 1, [UNKNOWN_KEY]: 'kept' }
    const next = { type: tag, edge: 2 }
    expect(graftAt(OUTER, previous, next)).toEqual({
      type: tag,
      radius: 1,
      [UNKNOWN_KEY]: 'kept',
      edge: 2,
    })
  })
})
