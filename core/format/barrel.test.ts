import { describe, expect, it } from 'vitest'
import { createDocumentValidator } from '../index'

describe('core public barrel: document validator', () => {
  it('re-exports createDocumentValidator from the core entry point', () => {
    expect(typeof createDocumentValidator).toBe('function')
  })

  it('the re-exported validator compiles a schema and validates a document', () => {
    const validate = createDocumentValidator({
      type: 'object',
      required: ['meta'],
      properties: { meta: { type: 'object' } },
    })
    expect(validate({ meta: {} }).valid).toBe(true)
    expect(validate({}).valid).toBe(false)
  })
})
