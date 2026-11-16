import { describe, expect, it } from 'vitest'
import { buildKnownKeys } from '../../scripts/schema/build-known-keys.mjs'

type SchemaNode = Record<string, unknown>

const THING_NAME = 'Thing'

const THING: SchemaNode = {
  type: 'object',
  properties: { a: { type: 'string' } },
  required: ['a'],
}

/** A one-property root schema whose property is the given node, with `Thing` defined. */
function schemaWithReference(property: SchemaNode) {
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties: { value: property },
    required: ['value'],
    additionalProperties: false,
    definitions: { [THING_NAME]: THING },
  }
}

/** A reference to `Thing` with one more keyword beside it. */
function referenceBeside(keyword: string, value: unknown): SchemaNode {
  return { $ref: '#/definitions/Thing', [keyword]: value }
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

describe('a reference in the table of known keys, with an annotation beside it', () => {
  it.each(['description', 'title', '$comment'])(
    'is accepted with %s beside it, and still records the referenced object',
    (annotation) => {
      const table = buildKnownKeys(schemaWithReference(referenceBeside(annotation, 'Some text')))

      expect(table.Project?.keys.value).toEqual({ kind: 'object', type: 'Thing' })
    },
  )
})

describe('a reference in the table of known keys, with a keyword that is not an annotation', () => {
  it.each([
    ['enum', ['x']],
    ['const', 'x'],
    ['default', {}],
  ])('is refused with a named error when %s sits beside it', (keyword, value) => {
    const error = refusalOf(schemaWithReference(referenceBeside(keyword as string, value)))

    expect(error).not.toBeInstanceOf(TypeError)
    expect(error.message).toMatch(new RegExp(`Project\\.value.*sibling.*${keyword}`))
  })
})
