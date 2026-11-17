import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION } from '../../core'
import { missingSchemaPaths, schemaCoverage } from './version-fixture-coverage'
import type { RootSchema } from './version-fixture-coverage'

/** Build a schema from a plain object, so a test can state shapes that the walker rejects. */
function schemaOf(shape: object): RootSchema {
  return { definitions: {}, ...shape } as RootSchema
}

const FLOOR_SCHEMA = schemaOf({
  type: 'object',
  properties: { floors: { type: 'array', items: { $ref: '#/definitions/floor' } } },
  definitions: {
    floor: {
      type: 'object',
      properties: { name: { type: 'string' }, height: { type: 'number' } },
    },
  },
})

const SURFACE_SCHEMA = schemaOf({
  type: 'object',
  properties: {
    paint: { type: 'object', additionalProperties: { $ref: '#/definitions/surface' } },
  },
  definitions: {
    surface: {
      anyOf: [
        { type: 'object', properties: { kind: { const: 'solid' }, color: { type: 'string' } } },
        { type: 'object', properties: { kind: { const: 'pattern' }, scale: { type: 'number' } } },
      ],
    },
  },
})

describe('the schema coverage walk', () => {
  it('reports a collection with no element by its path', () => {
    expect(missingSchemaPaths(FLOOR_SCHEMA, { floors: [] })).toContain('floors[]')
  })

  it('reports nothing for a document that carries every declared path', () => {
    const document = { floors: [{ name: 'Ground', height: 2400 }] }
    expect(missingSchemaPaths(FLOOR_SCHEMA, document)).toEqual([])
  })

  it('reports a scalar property that no element carries', () => {
    const document = { floors: [{ name: 'Ground' }, { name: 'Upper' }] }
    expect(missingSchemaPaths(FLOOR_SCHEMA, document)).toEqual(['floors[].height'])
  })

  it('counts a scalar property that only one of several elements carries', () => {
    const document = { floors: [{ name: 'Ground' }, { name: 'Upper', height: 2400 }] }
    expect(missingSchemaPaths(FLOOR_SCHEMA, document)).toEqual([])
  })

  it('reports a union variant that no value matches', () => {
    const document = { paint: { wall: { kind: 'solid', color: 'red' } } }
    expect(missingSchemaPaths(SURFACE_SCHEMA, document)).toEqual([
      'paint{}:surface(kind=pattern)',
      'paint{}:surface(kind=pattern).kind',
      'paint{}:surface(kind=pattern).scale',
    ])
  })

  it('lists every path of a non-trivial schema when the document is empty', () => {
    const paths = schemaCoverage(FLOOR_SCHEMA, {}).map((required) => required.path)
    expect(paths).toEqual(['floors[]', 'floors[].name', 'floors[].height'])
  })

  it('skips the open extensions namespace', () => {
    const schema = schemaOf({ type: 'object', properties: { extensions: { type: 'object' } } })
    expect(schemaCoverage(schema, {})).toEqual([])
  })

  it('ends on a reference cycle', () => {
    const schema = schemaOf({
      type: 'object',
      properties: { root: { $ref: '#/definitions/node' } },
      definitions: {
        node: {
          type: 'object',
          properties: { label: { type: 'string' }, next: { $ref: '#/definitions/node' } },
        },
      },
    })
    const document = { root: { label: 'a', next: { label: 'b' } } }
    expect(missingSchemaPaths(schema, document)).toEqual([])
  })

  it.each([
    ['oneOf', { oneOf: [{ type: 'string' }] }, 'oneOf'],
    ['allOf', { allOf: [{ type: 'string' }] }, 'allOf'],
    ['patternProperties', { type: 'object', patternProperties: {} }, 'patternProperties'],
    ['a type list', { type: ['string', 'null'] }, 'type list'],
    [
      'properties beside a value schema',
      {
        type: 'object',
        properties: { a: { type: 'string' } },
        additionalProperties: { type: 'number' },
      },
      'properties beside a value schema',
    ],
    ['a reference outside the definitions', { $ref: '#/other/Thing' }, 'reference'],
  ])('throws on %s and names the schema path', (_name, shape, mention) => {
    const schema = schemaOf({ type: 'object', properties: { field: shape } })
    expect(() => schemaCoverage(schema, {})).toThrow(new RegExp(`${mention}.*#/properties/field`))
  })

  it('throws on a union variant without a const discriminator', () => {
    const schema = schemaOf({
      type: 'object',
      properties: {
        value: { anyOf: [{ type: 'object', properties: { a: { type: 'string' } } }] },
      },
    })
    expect(() => schemaCoverage(schema, {})).toThrow(/variant of union at value has no const/)
  })

  it('derives a non-empty list of paths from the current published schema', () => {
    const published = resolve('schema', String(CURRENT_SCHEMA_VERSION), 'vernacular.schema.json')
    const schema: RootSchema = JSON.parse(readFileSync(published, 'utf8'))
    const paths = schemaCoverage(schema, {}).map((required) => required.path)
    expect(paths).toContain('floors[].walls[]')
  })
})
