import { describe, expect, it } from 'vitest'
import { buildKnownKeys } from '../../scripts/schema/build-known-keys.mjs'

type SchemaNode = Record<string, unknown>

const DEFINITION_NAME = 'Choice'
const UNION_NAME = 'Shape'

/** A one-property root schema whose property is the given node, with the given definitions. */
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

/** The same node placed inline and behind a definition, each with the place the error must name. */
function placements(node: SchemaNode): { where: string; schema: object; place: RegExp }[] {
  return [
    { where: 'an inline value', schema: schemaWith(node), place: /Project\.value/ },
    {
      where: 'a definition',
      schema: schemaWith({ $ref: `#/definitions/${DEFINITION_NAME}` }, { [DEFINITION_NAME]: node }),
      place: new RegExp(DEFINITION_NAME),
    },
  ]
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

interface Refusal {
  label: string
  schema: object
  place: RegExp
  scalarKeyword: string
  found: string
}

/** The scalar keywords, each with a value that suits a node of the given kind. */
function scalarKeywordsFor(value: unknown): [string, unknown][] {
  return [
    ['enum', [value]],
    ['const', value],
  ]
}

/** A node that lists allowed values beside one structural keyword, inline and as a definition. */
function besideKeyword(
  structuralKeyword: string,
  structuralValue: unknown,
  extra: SchemaNode = {},
) {
  return scalarKeywordsFor('a').flatMap(([scalarKeyword, scalarValue]) =>
    placements({
      ...extra,
      [scalarKeyword]: scalarValue,
      [structuralKeyword]: structuralValue,
    }).map(
      ({ where, schema, place }): Refusal => ({
        label: `${where} with ${scalarKeyword} beside ${structuralKeyword}${
          extra.type ? ` and type ${String(extra.type)}` : ''
        }`,
        schema,
        place,
        scalarKeyword,
        found: structuralKeyword,
      }),
    ),
  )
}

/** A node that lists allowed values beside a container type and nothing else structural. */
function besideContainerType(type: string, value: unknown) {
  return scalarKeywordsFor(value).flatMap(([scalarKeyword, scalarValue]) =>
    placements({ type, [scalarKeyword]: scalarValue }).map(
      ({ where, schema, place }): Refusal => ({
        label: `${where} with ${scalarKeyword} beside type ${type} alone`,
        schema,
        place,
        scalarKeyword,
        found: type,
      }),
    ),
  )
}

const TWO_VARIANTS = [{ type: 'string' }, { type: 'number' }]

const REFUSALS: Refusal[] = [
  ...besideKeyword('oneOf', TWO_VARIANTS),
  ...besideKeyword('allOf', [{ type: 'string' }]),
  ...besideKeyword('prefixItems', [{ type: 'string' }]),
  ...besideKeyword('additionalProperties', { type: 'string' }),
  ...besideKeyword('additionalProperties', { type: 'string' }, { type: 'object' }),
  ...besideKeyword('patternProperties', Object.fromEntries([['^x-', { type: 'string' }]])),
  ...besideContainerType('array', [1]),
  ...besideContainerType('object', {}),
]

describe('the table of known keys, for a scalar by enum or const that carries more structure', () => {
  it.each(REFUSALS)(
    'refuses $label, naming the place and both findings',
    ({ schema, place, scalarKeyword, found }) => {
      const error = refusalOf(schema)

      expect(error).not.toBeInstanceOf(TypeError)
      expect(error.message).toMatch(place)
      expect(error.message).toContain(scalarKeyword)
      expect(error.message).toContain(found)
    },
  )
})

/** A union behind `Shape` whose variants are the given nodes. */
function unionOf(...variants: SchemaNode[]) {
  return schemaWith({ $ref: `#/definitions/${UNION_NAME}` }, { [UNION_NAME]: { anyOf: variants } })
}

/** An object variant whose tag property is a `const`, with the given keywords added to the variant. */
function taggedVariant(tag: string, extra: SchemaNode = {}): SchemaNode {
  return {
    type: 'object',
    properties: { kind: { const: tag }, size: { type: 'number' } },
    required: ['kind', 'size'],
    additionalProperties: false,
    ...extra,
  }
}

describe('the table of known keys, for a union variant that lists allowed values', () => {
  it.each([
    ['enum', { enum: [{ kind: 'circle', size: 1 }] }],
    ['const', { const: { kind: 'circle', size: 1 } }],
  ])('refuses a variant with %s beside its properties, naming both', (scalarKeyword, extra) => {
    const error = refusalOf(unionOf(taggedVariant('circle', extra), taggedVariant('square')))

    expect(error).not.toBeInstanceOf(TypeError)
    expect(error.message).toContain(UNION_NAME)
    expect(error.message).toContain(scalarKeyword)
    expect(error.message).toContain('properties')
  })
})

describe('the table of known keys, for a plain scalar or a scalar inside a container', () => {
  const ACCEPTED: [string, SchemaNode][] = [
    ['a string with enum', { type: 'string', enum: ['a', 'b'] }],
    ['a plain const', { const: 'x' }],
    ['an integer with enum', { type: 'integer', enum: [1, 2] }],
  ]

  it.each(
    ACCEPTED.flatMap(([label, node]) =>
      placements(node).map((p) => [`${label}, as ${p.where}`, p.schema] as const),
    ),
  )('accepts %s', (_label, schema) => {
    expect(() => buildKnownKeys(schema)).not.toThrow()
  })

  it('accepts an inline array of strings with enum on the item, not on the array', () => {
    const node = { type: 'array', items: { type: 'string', enum: ['a', 'b'] } }
    expect(() => buildKnownKeys(schemaWith(node))).not.toThrow()
  })

  it('accepts a union whose variants carry their tag as a const property', () => {
    expect(() =>
      buildKnownKeys(unionOf(taggedVariant('circle'), taggedVariant('square'))),
    ).not.toThrow()
  })
})
