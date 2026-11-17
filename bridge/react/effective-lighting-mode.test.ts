import { describe, expect, it } from 'vitest'

import { effectiveLightingMode } from './effective-lighting-mode'

describe('effectiveLightingMode', () => {
  it('renders realistic when realistic lighting is requested, with no site involved', () => {
    expect(effectiveLightingMode(true)).toBe('realistic')
  })

  it('renders schematic when realistic lighting is not requested', () => {
    expect(effectiveLightingMode(false)).toBe('schematic')
  })
})
