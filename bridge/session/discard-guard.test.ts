import { describe, it, expect, vi } from 'vitest'
import { guardDestructive, needsDiscardConfirmation } from './discard-guard'

describe('needsDiscardConfirmation', () => {
  it('requires confirmation when the project is dirty', () => {
    expect(needsDiscardConfirmation(true)).toBe(true)
  })

  it('skips confirmation when the project is clean', () => {
    expect(needsDiscardConfirmation(false)).toBe(false)
  })
})

describe('guardDestructive', () => {
  it('runs the action directly and never consults confirm when the project is clean', async () => {
    const confirm = vi.fn(() => true)
    const run = vi.fn()

    await guardDestructive({ isDirty: false, confirm, run })

    expect(confirm).not.toHaveBeenCalled()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('consults confirm and runs the action when dirty and confirm resolves true', async () => {
    const confirm = vi.fn(() => Promise.resolve(true))
    const run = vi.fn()

    await guardDestructive({ isDirty: true, confirm, run })

    expect(confirm).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('consults confirm and skips the action when dirty and confirm resolves false', async () => {
    const confirm = vi.fn(() => Promise.resolve(false))
    const run = vi.fn()

    await guardDestructive({ isDirty: true, confirm, run })

    expect(confirm).toHaveBeenCalledTimes(1)
    expect(run).not.toHaveBeenCalled()
  })
})
