import { describe, it, expect } from 'vitest'
import { needsDiscardConfirmation } from './discard-guard'

describe('needsDiscardConfirmation', () => {
  it('requires confirmation when the project is dirty', () => {
    expect(needsDiscardConfirmation(true)).toBe(true)
  })

  it('skips confirmation when the project is clean', () => {
    expect(needsDiscardConfirmation(false)).toBe(false)
  })
})
