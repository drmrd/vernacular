import { describe, expect, it } from 'vitest'
import { KNOWN_KEYS, variantTypeOf, type KnownValue } from '../../core'

type KnownUnion = Extract<KnownValue, { kind: 'union' }>

/** Every union value found anywhere in the table, however deeply it is nested. */
function unionValuesIn(node: unknown): KnownUnion[] {
  if (Array.isArray(node)) return node.flatMap(unionValuesIn)
  if (node === null || typeof node !== 'object') return []
  const found = Object.values(node).flatMap(unionValuesIn)
  return (node as { kind?: unknown }).kind === 'union' ? [node as KnownUnion, ...found] : found
}

/** A union whose type names hold several dots and whose first tag value holds one too. */
const DOTTED_UNION: KnownUnion = {
  kind: 'union',
  tag: 'form',
  variants: [
    { value: 'round.big', type: 'Outer.Inner.round.big' },
    { value: 'big', type: 'Outer.Inner.big' },
    { value: 'flat', type: 'Outer.Inner.flat' },
  ],
}

const REAL_UNIONS = unionValuesIn(KNOWN_KEYS)

describe('variantTypeOf', () => {
  it('has a union of the real table to look in', () => {
    expect(REAL_UNIONS.length).toBeGreaterThan(0)
  })

  it('returns the entry name of each variant of each union in the real table', () => {
    for (const union of REAL_UNIONS) {
      for (const { value, type } of union.variants) {
        expect(variantTypeOf(union, value), `${union.tag} ${value}`).toBe(type)
      }
    }
  })

  it('returns undefined for a tag value that no variant has', () => {
    for (const union of REAL_UNIONS) {
      expect(variantTypeOf(union, 'noSuchVariant')).toBeUndefined()
    }
  })

  it.each([
    ['a number', 1],
    ['null', null],
    ['undefined', undefined],
    ['an object', { kind: 'solid' }],
    ['an array holding a tag value', ['solid']],
  ])('returns undefined for %s as the tag value', (_label, tagValue) => {
    for (const union of REAL_UNIONS) {
      expect(variantTypeOf(union, tagValue)).toBeUndefined()
    }
  })

  it.each(['constructor', 'toString', '__proto__'])(
    'returns undefined for the inherited name %s',
    (name) => {
      for (const union of REAL_UNIONS) {
        expect(variantTypeOf(union, name)).toBeUndefined()
      }
    },
  )

  it('finds a variant by its tag value alone, whatever dots the names hold', () => {
    expect(variantTypeOf(DOTTED_UNION, 'round.big')).toBe('Outer.Inner.round.big')
    expect(variantTypeOf(DOTTED_UNION, 'big')).toBe('Outer.Inner.big')
    expect(variantTypeOf(DOTTED_UNION, 'flat')).toBe('Outer.Inner.flat')
  })

  it('does not match a part of a tag value or of a type name', () => {
    expect(variantTypeOf(DOTTED_UNION, 'round')).toBeUndefined()
    expect(variantTypeOf(DOTTED_UNION, 'Inner.big')).toBeUndefined()
    expect(variantTypeOf(DOTTED_UNION, 'Outer.Inner.big')).toBeUndefined()
  })
})
