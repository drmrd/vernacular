import { describe, expect, it, vi } from 'vitest'
import { createLoadValidationGate } from './load-validation-gate'

describe('createLoadValidationGate', () => {
  it('reports issues without throwing when the document is invalid', () => {
    const report = vi.fn()
    const gate = createLoadValidationGate({
      validate: () => ({ valid: false, errors: [{ keyword: 'required' } as never] }),
      report,
    })
    expect(() => gate({ any: 'thing' })).not.toThrow()
    expect(report).toHaveBeenCalledOnce()
  })

  it('reports nothing when the document is valid', () => {
    const report = vi.fn()
    const gate = createLoadValidationGate({ validate: () => ({ valid: true, errors: [] }), report })
    gate({})
    expect(report).not.toHaveBeenCalled()
  })
})
