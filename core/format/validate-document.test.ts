/* eslint-disable @typescript-eslint/naming-convention */
// The VFPF spec (section 6.3) mandates reverse-DNS namespace keys for extensions.
import { describe, expect, it } from 'vitest'
import { createDocumentValidator } from './validate-document'

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['meta'],
  properties: {
    meta: { type: 'object' },
    extensions: { type: 'object' },
  },
}

describe('createDocumentValidator', () => {
  it('accepts a document that matches the schema', () => {
    const validate = createDocumentValidator(schema)
    expect(validate({ meta: {} }).valid).toBe(true)
  })

  it('accepts a document carrying an extensions object', () => {
    const validate = createDocumentValidator(schema)
    expect(validate({ meta: {}, extensions: { 'com.example.x': { a: 1 } } }).valid).toBe(true)
  })

  it('rejects a document with an unknown top-level key', () => {
    const validate = createDocumentValidator(schema)
    const result = validate({ meta: {}, bogus: 1 })
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('rejects a document missing a required member', () => {
    const validate = createDocumentValidator(schema)
    expect(validate({}).valid).toBe(false)
  })
})
