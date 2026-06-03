import { describe, expect, it } from 'vitest'
import { captureInverse } from './inverse-capture'

describe('captureInverse', () => {
  it('reverts a reassigned top-level property', () => {
    const root = { name: 'before', count: 1 }
    const { state, inverse } = captureInverse(root)

    state.name = 'after'
    expect(root.name).toBe('after')

    inverse.revert()
    expect(root.name).toBe('before')
    expect(root.count).toBe(1)
  })

  it('reverts an immutable slice replacement to the prior reference', () => {
    const root: { items: number[] } = { items: [1, 2] }
    const original = root.items
    const { state, inverse } = captureInverse(root)

    state.items = [...state.items, 3]
    expect(root.items).toEqual([1, 2, 3])

    inverse.revert()
    expect(root.items).toBe(original)
  })

  it('records only the first value when a property changes more than once', () => {
    const root = { value: 'a' }
    const { state, inverse } = captureInverse(root)

    state.value = 'b'
    state.value = 'c'

    inverse.revert()
    expect(root.value).toBe('a')
  })

  it('deletes a property that did not exist before the command', () => {
    const root: { a: number; b?: number } = { a: 1 }
    const { state, inverse } = captureInverse(root)

    state.b = 2
    expect(root.b).toBe(2)

    inverse.revert()
    expect('b' in root).toBe(false)
  })
})
