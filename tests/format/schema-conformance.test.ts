/* eslint-disable @typescript-eslint/naming-convention */
// The VFPF spec (section 6.3) mandates reverse-DNS namespace keys for extensions.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDocumentValidator } from '../../core'
import { SCHEMA_VERSION } from '../../scripts/schema/build-schema.mjs'

const schemaPath = resolve('schema', String(SCHEMA_VERSION), 'vernacular.schema.json')
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'))
const validate = createDocumentValidator(schema)

function fixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve('tests/fixtures/projects', name), 'utf8'))
}

describe('VFPF schema conformance', () => {
  it('accepts the minimal valid Document', () => {
    expect(validate(fixture('minimal.vernacular.json')).valid).toBe(true)
  })

  it('accepts a richer multi-floor Document', () => {
    expect(validate(fixture('two-floor-cottage.vernacular.json')).valid).toBe(true)
  })

  it('accepts a Document carrying namespaced extensions', () => {
    const doc = fixture('minimal.vernacular.json')
    doc.extensions = { 'com.example.solar': { panelKilowatts: 6.4 } }
    expect(validate(doc).valid).toBe(true)
  })

  it('rejects a Document with an unknown top-level key', () => {
    const doc = fixture('minimal.vernacular.json')
    doc.bogus = true
    expect(validate(doc).valid).toBe(false)
  })

  it('rejects a Document missing required meta', () => {
    expect(validate({ floors: [] }).valid).toBe(false)
  })
})
