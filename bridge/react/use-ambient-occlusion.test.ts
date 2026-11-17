import { describe, expect, it } from 'vitest'

import { ambientOcclusionActiveFor } from './use-ambient-occlusion'

describe('ambientOcclusionActiveFor', () => {
  it('runs the occlusion pass when realistic lighting is requested, with no site involved', () => {
    expect(ambientOcclusionActiveFor(true)).toBe(true)
  })

  it('skips the occlusion pass when realistic lighting is not requested', () => {
    expect(ambientOcclusionActiveFor(false)).toBe(false)
  })
})
