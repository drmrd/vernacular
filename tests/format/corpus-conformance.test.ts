import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDocumentValidator } from '../../core'
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
