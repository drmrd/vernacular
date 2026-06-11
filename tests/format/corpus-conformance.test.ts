import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  createDocumentValidator,
  createStrictValidator,
  type ExtensionSchemaRegistry,
} from '../../core'
import { SCHEMA_VERSION } from '../../scripts/schema/build-schema.mjs'

const schemaPath = resolve('schema', String(SCHEMA_VERSION), 'vernacular.schema.json')
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'))
const validate = createDocumentValidator(schema)

const corpusDir = resolve('tests/fixtures/projects/corpus')

function discoverCorpusFixtures(): string[] {
  let entries: string[]
  try {
    entries = readdirSync(corpusDir)
  } catch {
    // A missing corpus directory is an empty corpus, not a test error. The
    // "at least one fixture" assertion below turns that into a clean failure.
    return []
  }
  return entries.filter((name) => name.endsWith('.vernacular.json')).sort()
}

const corpusFixtures = discoverCorpusFixtures()

describe('VFPF corpus conformance gate', () => {
  it('discovers at least one corpus fixture', () => {
    expect(corpusFixtures.length).toBeGreaterThan(0)
  })

  it.each(corpusFixtures)('validates %s against the CORE profile', (fixtureName) => {
    const document = JSON.parse(readFileSync(resolve(corpusDir, fixtureName), 'utf8'))
    const result = validate(document)
    expect(
      result.valid,
      `corpus fixture ${fixtureName} failed CORE validation: ${JSON.stringify(result.errors, null, 2)}`,
    ).toBe(true)
  })
})

// Extension keys are reverse-DNS namespaces (spec section 6.3), not camelCase by design; the
// naming-convention rule is scoped off for these intentionally-namespaced literal keys.
/* eslint-disable @typescript-eslint/naming-convention */
const COVERED_OUTDOOR_NAMESPACE = 'org.vernacular.covered-outdoor'

const coveredOutdoorSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['rooms'],
  properties: {
    rooms: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'footprint'],
        properties: {
          name: { type: 'string' },
          footprint: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['x', 'y'],
              properties: { x: { type: 'number' }, y: { type: 'number' } },
            },
          },
        },
      },
    },
  },
}

const strictRegistry: ExtensionSchemaRegistry = new Map([
  [COVERED_OUTDOOR_NAMESPACE, coveredOutdoorSchema],
])
const validateStrict = createStrictValidator(schema, strictRegistry)

const minimalFixturePath = resolve('tests/fixtures/projects/minimal.vernacular.json')

function loadMinimalDocument(): Record<string, unknown> {
  return JSON.parse(readFileSync(minimalFixturePath, 'utf8'))
}

function declaresCoveredOutdoorNamespace(document: unknown): boolean {
  return JSON.stringify(document).includes(COVERED_OUTDOOR_NAMESPACE)
}

describe('VFPF corpus conformance gate (Strict profile)', () => {
  it.each(corpusFixtures)('validates %s against the Strict profile', (fixtureName) => {
    const document = JSON.parse(readFileSync(resolve(corpusDir, fixtureName), 'utf8'))
    const result = validateStrict(document)
    expect(
      result.valid,
      `corpus fixture ${fixtureName} failed Strict validation: ${JSON.stringify(result.errors, null, 2)}`,
    ).toBe(true)
  })

  it('declares the covered-outdoor namespace in at least one corpus fixture', () => {
    const declaringFixtures = corpusFixtures.filter((fixtureName) =>
      declaresCoveredOutdoorNamespace(
        JSON.parse(readFileSync(resolve(corpusDir, fixtureName), 'utf8')),
      ),
    )
    expect(
      declaringFixtures.length,
      `no corpus fixture declares the ${COVERED_OUTDOOR_NAMESPACE} extension namespace`,
    ).toBeGreaterThan(0)
  })

  it('rejects a malformed registered namespace payload', () => {
    const document = loadMinimalDocument()
    document.extensions = {
      [COVERED_OUTDOOR_NAMESPACE]: { rooms: [{ name: 'Porch', footprint: 'not-an-array' }] },
    }
    expect(validateStrict(document).valid).toBe(false)
  })

  it('accepts a well-formed registered namespace payload', () => {
    const document = loadMinimalDocument()
    document.extensions = { [COVERED_OUTDOOR_NAMESPACE]: { rooms: [] } }
    expect(validateStrict(document).valid).toBe(true)
  })

  it('accepts an unregistered extension namespace', () => {
    const document = loadMinimalDocument()
    document.extensions = { 'com.example.unknown': { anything: true } }
    expect(validateStrict(document).valid).toBe(true)
  })
})
/* eslint-enable @typescript-eslint/naming-convention */
