import { describe, expect, it } from 'vitest'
import { toneMappingOperatorFor } from './tone-mapping'
import type { LightingMode } from './environment-state'

describe('toneMappingOperatorFor', () => {
  it('chooses the AgX filmic operator for realistic mode with the color check off', () => {
    const mode: LightingMode = 'realistic'

    expect(toneMappingOperatorFor(mode, false)).toBe('agx')
  })

  it('keeps the hue-preserving Neutral operator for schematic mode with the color check off', () => {
    const mode: LightingMode = 'schematic'

    expect(toneMappingOperatorFor(mode, false)).toBe('neutral')
  })

  it('forces the Neutral operator in realistic mode when the color check is on', () => {
    const mode: LightingMode = 'realistic'

    expect(toneMappingOperatorFor(mode, true)).toBe('neutral')
  })

  it('keeps the Neutral operator in schematic mode when the color check is on', () => {
    const mode: LightingMode = 'schematic'

    expect(toneMappingOperatorFor(mode, true)).toBe('neutral')
  })
})
