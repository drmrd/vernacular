import { describe, it, expect } from 'vitest'
import { breakpointForWidth, WIDE_MIN_WIDTH, MEDIUM_MIN_WIDTH } from './use-breakpoint'

describe('breakpointForWidth', () => {
  it('reports wide at and above the wide threshold', () => {
    expect(breakpointForWidth(WIDE_MIN_WIDTH)).toBe('wide')
    expect(breakpointForWidth(WIDE_MIN_WIDTH + 1)).toBe('wide')
  })

  it('reports medium between the medium and wide thresholds', () => {
    expect(breakpointForWidth(MEDIUM_MIN_WIDTH)).toBe('medium')
    expect(breakpointForWidth(WIDE_MIN_WIDTH - 1)).toBe('medium')
  })

  it('reports narrow below the medium threshold', () => {
    expect(breakpointForWidth(MEDIUM_MIN_WIDTH - 1)).toBe('narrow')
    expect(breakpointForWidth(0)).toBe('narrow')
  })
})
