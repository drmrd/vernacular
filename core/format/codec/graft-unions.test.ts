// The made-up table names its variants Union.tag, which is not camelCase by design.
/* eslint-disable @typescript-eslint/naming-convention */
import { describe, expect, it } from 'vitest'
import {
  KNOWN_KEYS,
  KNOWN_ROOT_TYPE,
  variantTypeOf,
  type KnownKeyTable,
  type KnownValue,
} from '../../index'
import { graftWithTable } from './graft'

const UNKNOWN_KEY = 'keyFromANewerBuild'

function objectAt(type: string): KnownValue {
  return { kind: 'object', type }
}

const ASSET = { scope: 'project', contentHash: 'sha256-aaaa' }
const OTHER_ASSET = { scope: 'project', contentHash: 'sha256-bbbb' }

function graftAtRoot(previous: unknown, next: unknown): unknown {
  return graftWithTable(previous, next, { table: KNOWN_KEYS, at: objectAt(KNOWN_ROOT_TYPE) })
}

function documentWithSource(source: unknown): unknown {
  return { floors: [{ id: 'f1', underlays: [{ id: 'u1', source }] }] }
}

function documentWithPaint(treatment: unknown): unknown {
  return { paint: { s1: treatment } }
}

const SOLID = { kind: 'solid', color: { r: 1, g: 0, b: 0 }, finishId: 'matte' }
const PATTERN = { kind: 'pattern', patternId: 'herringbone', scale: 100, colors: [] }
const RASTER = { kind: 'raster', image: ASSET }
function withoutKey(value: Record<string, unknown>, key: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([name]) => name !== key))
}

const DOCUMENT = { kind: 'document', document: OTHER_ASSET, page: 2 }

describe('graftWithTable a changed tagged-union variant', () => {
  it('does not give an underlay source that became a document its old raster image back', () => {
    const grafted = graftAtRoot(documentWithSource(RASTER), documentWithSource(DOCUMENT))
    expect(grafted).toEqual(documentWithSource(DOCUMENT))
  })

  it('does not give an underlay source that became a raster its old document back', () => {
    const grafted = graftAtRoot(documentWithSource(DOCUMENT), documentWithSource(RASTER))
    expect(grafted).toEqual(documentWithSource(RASTER))
  })

  it.each([
    { from: 'solid', to: 'pattern', was: SOLID, now: PATTERN },
    { from: 'pattern', to: 'solid', was: PATTERN, now: SOLID },
  ])('does not give a paint entry that changed from $from to $to the old fields back', (change) => {
    const grafted = graftAtRoot(documentWithPaint(change.was), documentWithPaint(change.now))
    expect(grafted).toEqual(documentWithPaint(change.now))
  })
})

describe('graftWithTable an unknown key on a tagged-union value', () => {
  it('survives on a paint entry whose variant stays the same', () => {
    const was = { ...SOLID, [UNKNOWN_KEY]: { depth: { value: 1 } } }
    const now = { ...SOLID, color: { r: 0, g: 0, b: 1 } }
    const grafted = graftAtRoot(documentWithPaint(was), documentWithPaint(now))
    expect(grafted).toEqual(documentWithPaint({ ...now, [UNKNOWN_KEY]: { depth: { value: 1 } } }))
  })

  it('survives on an underlay source whose variant stays the same', () => {
    const was = { ...RASTER, [UNKNOWN_KEY]: 'kept' }
    const now = { ...RASTER, image: OTHER_ASSET }
    const grafted = graftAtRoot(documentWithSource(was), documentWithSource(now))
    expect(grafted).toEqual(documentWithSource({ ...now, [UNKNOWN_KEY]: 'kept' }))
  })
})

describe('graftWithTable a known key dropped from a tagged-union value of the same variant', () => {
  it('stays dropped on a paint entry', () => {
    const now = withoutKey(SOLID, 'finishId')
    const grafted = graftAtRoot(documentWithPaint(SOLID), documentWithPaint(now))
    expect(grafted).toEqual(documentWithPaint(now))
  })

  it('stays dropped on an underlay source', () => {
    const now = withoutKey(DOCUMENT, 'page')
    const grafted = graftAtRoot(documentWithSource(DOCUMENT), documentWithSource(now))
    expect(grafted).toEqual(documentWithSource(now))
  })
})

type UnionValue = Extract<KnownValue, { kind: 'union' }>
type UnionVariant = UnionValue['variants'][number]

interface UnionKeyCase {
  readonly table: KnownKeyTable
  readonly union: UnionValue
  readonly from: string
  readonly fromValue: string
  readonly key: string
  readonly to: string
  readonly toValue: string
}

function unionsIn(value: KnownValue): UnionValue[] {
  switch (value.kind) {
    case 'union':
      return [value]
    case 'array':
      return unionsIn(value.item)
    case 'map':
      return unionsIn(value.value)
    default:
      return []
  }
}

function unionsOf(table: KnownKeyTable): UnionValue[] {
  return Object.values(table).flatMap((type) => Object.values(type.keys).flatMap(unionsIn))
}

/** Every key a variant defines, paired with every variant it could be dropped for. */
function casesFor(table: KnownKeyTable, union: UnionValue, from: UnionVariant): UnionKeyCase[] {
  const variant = table[from.type]!
  return Object.keys(variant.keys)
    .filter((key) => key !== union.tag)
    .flatMap((key) =>
      union.variants
        .filter((to) => to.type !== from.type || variant.optional.includes(key))
        .map((to) => ({
          table,
          union,
          from: from.type,
          fromValue: from.value,
          key,
          to: to.type,
          toValue: to.value,
        })),
    )
}

function unionKeyCases(table: KnownKeyTable): UnionKeyCase[] {
  return unionsOf(table).flatMap((union) =>
    union.variants.flatMap((from) => casesFor(table, union, from)),
  )
}

function expectNoRestoredKey({
  table,
  union,
  from,
  fromValue,
  key,
  to,
  toValue,
}: UnionKeyCase): void {
  const previous = { [union.tag]: fromValue, [key]: 'value from the previous file' }
  const next = { [union.tag]: toValue }
  expect(variantTypeOf(union, previous[union.tag])).toBe(from)
  expect(variantTypeOf(union, next[union.tag])).toBe(to)
  expect(graftWithTable(previous, next, { table, at: union })).toEqual(next)
}

const unionKeyCasesOfTheTable = unionKeyCases(KNOWN_KEYS)

describe('graftWithTable every union position in the table of known keys', () => {
  it('generates its cases from at least one union position', () => {
    expect(unionsOf(KNOWN_KEYS).length).toBeGreaterThan(0)
    expect(unionKeyCasesOfTheTable.length).toBeGreaterThan(0)
  })

  it.each(unionKeyCasesOfTheTable)(
    'does not restore $key of $from when the next value is $to',
    expectNoRestoredKey,
  )
})

const MADE_UP_TABLE: KnownKeyTable = {
  Holder: {
    keys: {
      figure: {
        kind: 'union',
        tag: 'type',
        variants: [
          { value: 'round', type: 'Figure.round' },
          { value: 'square', type: 'Figure.square' },
        ],
      },
    },
    optional: [],
  },
  'Figure.round': {
    keys: { type: { kind: 'leaf' }, radius: { kind: 'leaf' }, label: { kind: 'leaf' } },
    optional: ['label'],
  },
  'Figure.square': {
    keys: { type: { kind: 'leaf' }, side: { kind: 'leaf' } },
    optional: [],
  },
}
const unionKeyCasesOfTheMadeUpTable = unionKeyCases(MADE_UP_TABLE)

describe('graftWithTable a union under another name in a made-up table', () => {
  it('generates cases for a variant change and for a dropped optional key', () => {
    expect(
      unionKeyCasesOfTheMadeUpTable.map(({ from, key, to }) => `${from} ${key} ${to}`),
    ).toEqual(
      expect.arrayContaining([
        'Figure.round radius Figure.square',
        'Figure.round label Figure.round',
      ]),
    )
  })

  it.each(unionKeyCasesOfTheMadeUpTable)(
    'does not restore $key of $from when the next value is $to',
    expectNoRestoredKey,
  )

  it('keeps an unknown key of the previous value while the variant stays', () => {
    const previous = { type: 'square', side: 3, [UNKNOWN_KEY]: 'kept' }
    const next = { type: 'square', side: 4 }
    const at = MADE_UP_TABLE['Holder']!.keys['figure']!
    const grafted = graftWithTable(previous, next, { table: MADE_UP_TABLE, at })
    expect(grafted).toEqual({ type: 'square', side: 4, [UNKNOWN_KEY]: 'kept' })
  })
})
