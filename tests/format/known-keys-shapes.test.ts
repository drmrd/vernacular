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
function taggedUnionSchema(
  tagKey: string,
  tagValues: string[],
  combinator: 'anyOf' | 'oneOf' = 'anyOf',
) {
  const variants = tagValues.map((tagValue) => variant(tagKey, tagValue))
  return schemaWith(
    { $ref: '#/definitions/Shape' },
    definition('Shape', { [combinator]: variants }),
  )
}

/** The error that `buildKnownKeys` stops with, which fails the test when it accepts the schema. */
function refusalOf(schema: object): Error {
  try {
    buildKnownKeys(schema)
  } catch (error) {
    return error as Error
  }
  return expect.fail('the generator accepted a schema it cannot express')
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

/** An object definition with one scalar property, for the shapes that mix it with something else. */
const PATTERN = '^x-'

const PLAIN_OBJECT: SchemaNode = {
  type: 'object',
  properties: { a: { type: 'string' } },
  required: ['a'],
}

const INEXPRESSIBLE_SHAPES: InexpressibleShape[] = [
  {
    label: 'an array of arrays behind a reference',
    property: { $ref: '#/definitions/Grid' },
    definitions: definition('Grid', {
      type: 'array',
      items: { type: 'array', items: { type: 'number' } },
    }),
    namesTheShape: /Grid.*array of arrays/,
  },
  {
    label: 'an inline array of arrays',
    property: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
    definitions: {},
    namesTheShape: /Project\.value.*array of arrays/,
  },
  {
    label: 'a tuple',
    property: { type: 'array', prefixItems: [{ type: 'number' }, { type: 'string' }] },
    definitions: {},
    namesTheShape: /Project\.value.*tuple/,
  },
  {
    label: 'a oneOf with no shared tag',
    property: { $ref: '#/definitions/Either' },
    definitions: definition('Either', { oneOf: [{ type: 'string' }, { type: 'number' }] }),
    namesTheShape: /Either.*tag/,
  },
  {
    label: 'an anyOf of objects with no constant tag that every variant shares',
    property: { $ref: '#/definitions/Either' },
    definitions: definition('Either', {
      anyOf: [
        { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] },
        { type: 'object', properties: { b: { type: 'number' } }, required: ['b'] },
      ],
    }),
    namesTheShape: /Either.*tag/,
  },
  {
    label: 'a property whose type is a list of types',
    property: { type: ['string', 'null'] },
    definitions: {},
    namesTheShape: /Project\.value.*type list/,
  },
  {
    label: 'a property with allOf',
    property: { allOf: [{ type: 'string' }] },
    definitions: {},
    namesTheShape: /Project\.value.*allOf/,
  },
  {
    label: 'a reference to a definition that does not exist',
    property: { $ref: '#/definitions/Missing' },
    definitions: {},
    namesTheShape: /Project\.value.*Missing/,
  },
  {
    label: 'an object with properties and a schema-valued additionalProperties',
    property: { $ref: '#/definitions/Bag' },
    definitions: definition('Bag', { ...PLAIN_OBJECT, additionalProperties: { type: 'number' } }),
    namesTheShape: /Bag.*additionalProperties/,
  },
  {
    label: 'an object with properties and patternProperties',
    property: { $ref: '#/definitions/Bag' },
    definitions: definition('Bag', {
      ...PLAIN_OBJECT,
      patternProperties: { [PATTERN]: { type: 'number' } },
    }),
    namesTheShape: /Bag.*patternProperties/,
  },
  {
    label: 'a reference with sibling keywords beside it',
    property: {
      $ref: '#/definitions/A',
      type: 'object',
      properties: { b: { type: 'string' } },
    },
    definitions: definition('A', PLAIN_OBJECT),
    namesTheShape: /Project\.value.*sibling.*type.*properties/,
  },
  {
    label: 'a definition with both properties and anyOf',
    property: { $ref: '#/definitions/Mixed' },
    definitions: definition('Mixed', { ...PLAIN_OBJECT, anyOf: [{ type: 'string' }] }),
    namesTheShape: /Mixed.*anyOf/,
  },
  {
    label: 'an object with additionalProperties false and no properties',
    property: { additionalProperties: false },
    definitions: {},
    namesTheShape: /Project\.value.*no properties/,
  },
]

describe('the table of known keys, for a schema shape it cannot express', () => {
  it.each(INEXPRESSIBLE_SHAPES)(
    'refuses $label with a named error instead of recording it',
    ({ property, definitions, namesTheShape }) => {
      const error = refusalOf(schemaWith(property, definitions))

      expect(error).toBeInstanceOf(Error)
      expect(error).not.toBeInstanceOf(TypeError)
      expect(error.message).toMatch(namesTheShape)
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
  it('is recorded for a union written with oneOf, with a variant entry for each tag value', () => {
    const table = buildKnownKeys(taggedUnionSchema('kind', ['circle', 'square'], 'oneOf'))
    expect(table.Project?.keys.value).toEqual({
      kind: 'union',
      tag: 'kind',
      types: ['Shape.circle', 'Shape.square'],
    })
    expect(Object.keys(table)).toEqual(
      expect.arrayContaining(['Project', 'Shape.circle', 'Shape.square']),
    )
  })

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
