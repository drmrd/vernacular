import { describe, expect, it } from 'vitest'

import { advanceOpenness, OPENNESS_RATE_PER_S } from './opening-openness'

describe('advanceOpenness', () => {
  const partialStep = 0.1

  it('eases toward the open target at the fixed rate', () => {
    const next = advanceOpenness(0, 1, partialStep)

    expect(next).toBeCloseTo(OPENNESS_RATE_PER_S * partialStep, 5)
    expect(next).toBeGreaterThan(0)
    expect(next).toBeLessThan(1)
  })

  it('settles exactly at the open target without overshooting', () => {
    // A whole-second step covers more than the remaining gap, so it clamps to 1.
    const next = advanceOpenness(0.9, 1, 1)

    expect(next).toBe(1)
  })

  it('eases back toward the closed target', () => {
    const next = advanceOpenness(0.5, 0, partialStep)

    expect(next).toBeCloseTo(0.5 - OPENNESS_RATE_PER_S * partialStep, 5)
  })

  it('settles exactly at the closed target without undershooting', () => {
    const next = advanceOpenness(0.1, 0, 1)

    expect(next).toBe(0)
  })
})
