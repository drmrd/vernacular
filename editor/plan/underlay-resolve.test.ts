import { describe, expect, it } from 'vitest'
import type { UnderlayRef } from './underlay-resolve'
import { underlaysNeedingDecode } from './underlay-resolve'

function ref(contentHash: string): UnderlayRef {
  return { contentHash }
}

describe('underlaysNeedingDecode', () => {
  it('drops already-decoded hashes and de-duplicates the rest in first-seen order', () => {
    const underlays = [ref('a'), ref('b'), ref('a')]

    expect(underlaysNeedingDecode(underlays, new Set(['b']))).toEqual(['a'])
  })

  it('returns an empty array when there are no underlays', () => {
    expect(underlaysNeedingDecode([], new Set())).toEqual([])
  })

  it('returns an empty array when every underlay is already decoded', () => {
    const underlays = [ref('a'), ref('b')]

    expect(underlaysNeedingDecode(underlays, new Set(['a', 'b']))).toEqual([])
  })

  it('preserves first-seen order while de-duplicating repeated hashes', () => {
    const underlays = [ref('x'), ref('y'), ref('x'), ref('z')]

    expect(underlaysNeedingDecode(underlays, new Set())).toEqual(['x', 'y', 'z'])
  })
})
