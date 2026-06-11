import { describe, expect, it } from 'vitest'
import { createTolerantValidator } from './tolerant-validation'

const schema = {
  type: 'object',
  properties: { meta: { type: 'object' } },
  required: ['meta'],
  additionalProperties: false,
}

describe('createTolerantValidator', () => {
  it('accepts a document carrying an unknown top-level key', () => {
    const validate = createTolerantValidator(schema)
    expect(validate({ meta: {}, annotations: { x: 1 } }).valid).toBe(true)
  })

  it('still reports a genuine shape break (missing required key)', () => {
    const validate = createTolerantValidator(schema)
    const result = validate({ annotations: {} })
    expect(result.valid).toBe(false)
    expect(result.errors.some((error) => error.keyword === 'required')).toBe(true)
  })
})
