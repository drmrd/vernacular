import { describe, expect, it } from 'vitest'
import { KNOWN_KEYS } from '../../core'
import { buildKnownKeys } from '../../scripts/schema/build-known-keys.mjs'
import { buildProjectSchema } from '../../scripts/schema/build-schema.mjs'

const GENERATION_TIMEOUT_MS = 30_000

type SchemaNode = Record<string, unknown>

/** A one-property root schema, with the definitions it refers to. */
function schemaWith(property: SchemaNode, definitions: Record<string, SchemaNode> = {}) {
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties: { value: property },
    required: ['value'],
    additionalProperties: false,
    definitions,
  }
}

/** An object variant of a tagged union. */
function variant(tagKey: string, tagValue: string): SchemaNode {
  return {
    type: 'object',
    properties: { [tagKey]: { type: 'string', const: tagValue }, size: { type: 'number' } },
    required: [tagKey, 'size'],
    additionalProperties: false,
  }
}

/** One named definition, for the `definitions` of a schema. */
function definition(name: string, node: SchemaNode): Record<string, SchemaNode> {
  return { [name]: node }
}

/** A tagged union over the given tag key and tag values, referenced from the root. */
function taggedUnionSchema(tagKey: string, tagValues: string[]) {
  const variants = tagValues.map((tagValue) => variant(tagKey, tagValue))
  return schemaWith({ $ref: '#/definitions/Shape' }, definition('Shape', { anyOf: variants }))
}

type TaggedUnionValue = { kind: 'union'; tag?: string; types: string[] }

/** Every union value found anywhere in the table, however deeply it is nested. */
function unionValuesIn(node: unknown): TaggedUnionValue[] {
  if (Array.isArray(node)) return node.flatMap(unionValuesIn)
  if (node === null || typeof node !== 'object') return []
  const found = Object.values(node).flatMap(unionValuesIn)
  return (node as { kind?: unknown }).kind === 'union'
    ? [node as TaggedUnionValue, ...found]
    : found
}

/** The key whose `const` marks each variant of the named union in the real schema. */
function tagKeyOf(schema: object, unionName: string): string | undefined {
  const definitions = (schema as SchemaNode).definitions as Record<string, { anyOf: SchemaNode[] }>
  const first = definitions[unionName]?.anyOf[0]?.properties as Record<string, SchemaNode>
  return Object.entries(first ?? {}).find(([, value]) => value.const !== undefined)?.[0]
}

interface InexpressibleShape {
  label: string
  property: SchemaNode
  definitions: Record<string, SchemaNode>
  namesTheShape: RegExp
}

const INEXPRESSIBLE_SHAPES: InexpressibleShape[] = [
  {
    label: 'an array of arrays',
    property: { $ref: '#/definitions/Grid' },
    definitions: definition('Grid', {
      type: 'array',
      items: { type: 'array', items: { type: 'number' } },
    }),
    namesTheShape: /Grid|value/,
  },
  {
    label: 'a tuple',
    property: { type: 'array', prefixItems: [{ type: 'number' }, { type: 'string' }] },
    definitions: {},
    namesTheShape: /value/,
  },
  {
    label: 'a oneOf with no shared tag',
    property: { $ref: '#/definitions/Either' },
    definitions: definition('Either', { oneOf: [{ type: 'string' }, { type: 'number' }] }),
    namesTheShape: /Either|value/,
  },
]

describe('the table of known keys, for a schema shape it cannot express', () => {
  it.each(INEXPRESSIBLE_SHAPES)(
    'refuses $label instead of recording it as a leaf',
    ({ property, definitions, namesTheShape }) => {
      expect(() => buildKnownKeys(schemaWith(property, definitions))).toThrow(namesTheShape)
    },
  )

  it('refuses two variants of one tagged union that carry the same tag value', () => {
    const schema = taggedUnionSchema('kind', ['circle', 'square', 'circle'])
    expect(() => buildKnownKeys(schema)).toThrow(/Shape.*circle|circle.*Shape/)
  })
})

describe('the table of known keys, for a schema shape it can express', () => {
  it('records a scalar, an enum, and an array of scalars as leaves', () => {
    const schema = {
      ...schemaWith({ type: 'string' }),
      properties: {
        name: { type: 'string' },
        mode: { type: 'string', enum: ['a', 'b'] },
        sizes: { type: 'array', items: { type: 'number' } },
      },
      required: ['name', 'mode', 'sizes'],
    }
    const keys = buildKnownKeys(schema).Project?.keys
    expect(keys?.name).toEqual({ kind: 'leaf' })
    expect(keys?.mode).toEqual({ kind: 'leaf' })
    expect(keys?.sizes).toEqual({ kind: 'leaf' })
  })
})

describe('the tag key of a union in the table of known keys', () => {
  it('is recorded for a union tagged by a key other than kind', () => {
    const table = buildKnownKeys(taggedUnionSchema('type', ['circle', 'square']))
    expect(table.Project?.keys.value).toEqual({
      kind: 'union',
      tag: 'type',
      types: ['Shape.circle', 'Shape.square'],
    })
  })

  it(
    'is recorded on every union of the real schema, as the key the schema tags it with',
    { timeout: GENERATION_TIMEOUT_MS },
    () => {
      const schema = buildProjectSchema()
      const unions = unionValuesIn(KNOWN_KEYS)
      expect(unions.length).toBeGreaterThan(0)
      for (const union of unions) {
        const unionName = (union.types[0] ?? '').split('.')[0] ?? ''
        expect(union.tag, unionName).toBe(tagKeyOf(schema, unionName))
      }
    },
  )
})
