import { describe, expect, it } from 'vitest'
import { buildKnownKeys } from '../../scripts/schema/build-known-keys.mjs'

type SchemaNode = Record<string, unknown>

const DEFINITION_NAME = 'Choice'

/** The structural keywords that cannot sit on a node that also lists its allowed values. */
const STRUCTURAL_KEYWORDS: [string, unknown][] = [
  ['properties', { a: { type: 'string' } }],
  ['items', { type: 'number' }],
  ['anyOf', [{ type: 'string' }, { type: 'number' }]],
]

/** The keywords that list the allowed values of a scalar. */
const SCALAR_KEYWORDS: [string, unknown][] = [
  ['enum', ['a', 'b']],
  ['const', 'a'],
]

/** A one-property root schema whose property is the given node, with `Choice` defined as a scalar. */
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

/** The error that `buildKnownKeys` stops with, which fails the test when it accepts the schema. */
function refusalOf(schema: object): Error {
  try {
    buildKnownKeys(schema)
  } catch (error) {
    return error as Error
  }
  return expect.fail('the generator accepted a schema it cannot express')
}

interface MixedShape {
  label: string
  schema: object
  place: RegExp
  scalarKeyword: string
  structuralKeyword: string
}

/** Every pairing of a scalar keyword with a structural one, inline and as a definition. */
function mixedShapes(): MixedShape[] {
  return SCALAR_KEYWORDS.flatMap(([scalarKeyword, scalarValue]) =>
    STRUCTURAL_KEYWORDS.flatMap(([structuralKeyword, structuralValue]) => {
      const node = { [scalarKeyword]: scalarValue, [structuralKeyword]: structuralValue }
      const label = `${scalarKeyword} with ${structuralKeyword}`
      return [
        {
          label: `an inline value with ${label}`,
          schema: schemaWith(node),
          place: /Project\.value/,
          scalarKeyword,
          structuralKeyword,
        },
        {
          label: `a definition with ${label}`,
          schema: schemaWith(
            { $ref: `#/definitions/${DEFINITION_NAME}` },
            { [DEFINITION_NAME]: node },
          ),
          place: new RegExp(DEFINITION_NAME),
          scalarKeyword,
          structuralKeyword,
        },
      ]
    }),
  )
}

describe('the table of known keys, for a node that lists allowed values and also has structure', () => {
  it.each(mixedShapes())(
    'refuses $label, naming the place and both keywords',
    ({ schema, place, scalarKeyword, structuralKeyword }) => {
      const error = refusalOf(schema)

      expect(error).not.toBeInstanceOf(TypeError)
      expect(error.message).toMatch(place)
      expect(error.message).toContain(scalarKeyword)
      expect(error.message).toContain(structuralKeyword)
    },
  )
})
