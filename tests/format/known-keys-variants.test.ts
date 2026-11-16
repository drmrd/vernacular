import { describe, expect, it } from 'vitest'
import { KNOWN_KEYS, type KnownValue } from '../../core'
import { buildKnownKeys } from '../../scripts/schema/build-known-keys.mjs'

type KnownUnion = Extract<KnownValue, { kind: 'union' }>

/** Every union value found anywhere in the table, however deeply it is nested. */
function unionValuesIn(node: unknown): KnownUnion[] {
  if (Array.isArray(node)) return node.flatMap(unionValuesIn)
  if (node === null || typeof node !== 'object') return []
  const found = Object.values(node).flatMap(unionValuesIn)
  return (node as { kind?: unknown }).kind === 'union' ? [node as KnownUnion, ...found] : found
}

const UNION_NAME = 'Shape'

/** A tagged union of two object variants whose tag constant is the given value, behind `Shape`. */
function schemaWithTagConstants(first: unknown, second: unknown) {
  const variant = (tagConstant: unknown) => ({
    type: 'object',
    properties: { kind: { const: tagConstant }, size: { type: 'number' } },
    required: ['kind', 'size'],
    additionalProperties: false,
  })
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties: { value: { $ref: `#/definitions/${UNION_NAME}` } },
    required: ['value'],
    additionalProperties: false,
    definitions: { [UNION_NAME]: { anyOf: [variant(first), variant(second)] } },
  }
}

describe('each union in the generated table of known keys', () => {
  const unions = unionValuesIn(KNOWN_KEYS)

  it('is found in the real table, so the checks below have something to check', () => {
    expect(unions.length).toBeGreaterThan(0)
  })

  it('lists its variants with the tag value and the entry name of each', () => {
    expect(KNOWN_KEYS.Project.keys.paint).toEqual({
      kind: 'map',
      value: {
        kind: 'union',
        tag: 'kind',
        variants: [
          { value: 'solid', type: 'SurfaceTreatment.solid' },
          { value: 'pattern', type: 'SurfaceTreatment.pattern' },
        ],
      },
    })
  })

  it('carries no list of type names beside its variants', () => {
    for (const union of unions) {
      expect(union).not.toHaveProperty('types')
      expect(Array.isArray(union.variants)).toBe(true)
    }
  })

  it('names, for each variant, an entry of the table that has the tag key', () => {
    for (const union of unions) {
      for (const { type } of union.variants) {
        expect(Object.keys(KNOWN_KEYS), type).toContain(type)
        expect(Object.keys(KNOWN_KEYS[type]?.keys ?? {}), type).toContain(union.tag)
      }
    }
  })

  it('gives each variant its own tag value', () => {
    for (const union of unions) {
      const values = union.variants.map(({ value }) => value)
      expect(new Set(values).size).toBe(values.length)
    }
  })
})

describe('the table of known keys, for a variant whose tag constant is not a string', () => {
  it('refuses the schema with an error that names the union', () => {
    const schema = schemaWithTagConstants(1, 2)
    expect(() => buildKnownKeys(schema)).toThrow(/Shape.*string|string.*Shape/)
  })

  it('refuses the schema when only one of the variants has such a constant', () => {
    const schema = schemaWithTagConstants('circle', null)
    expect(() => buildKnownKeys(schema)).toThrow(/Shape.*string|string.*Shape/)
  })
})
