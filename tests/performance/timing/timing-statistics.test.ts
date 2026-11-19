import { describe, expect, it } from 'vitest'
import { summarizeSamples } from './timing-statistics'

function countUpTo(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index + 1)
}

describe('summarizing timing samples', () => {
  it('reports the middle sample as the median of an odd count', () => {
    expect(summarizeSamples([5, 1, 3]).medianMs).toBe(3)
  })

  it('reports the mean of the two middle samples as the median of an even count', () => {
    expect(summarizeSamples([4, 1, 3, 2]).medianMs).toBe(2.5)
  })

  it('reports the 95th percentile by nearest rank for 100 samples', () => {
    expect(summarizeSamples(countUpTo(100)).p95Ms).toBe(95)
  })

  it('reports the 95th percentile by nearest rank for 20 samples', () => {
    expect(summarizeSamples(countUpTo(20)).p95Ms).toBe(19)
  })

  it('reports how many samples it summarized', () => {
    expect(summarizeSamples([2, 4, 6, 8, 10, 12, 14]).samples).toBe(7)
  })

  it('summarizes a single sample as itself', () => {
    expect(summarizeSamples([7])).toEqual({ samples: 1, medianMs: 7, p95Ms: 7 })
  })

  it('rounds the reported times to 0.01 milliseconds', () => {
    expect(summarizeSamples([1.234567])).toEqual({ samples: 1, medianMs: 1.23, p95Ms: 1.23 })
  })

  it('leaves the order of the input samples unchanged', () => {
    const samples = [9, 2, 7, 4]
    summarizeSamples(samples)
    expect(samples).toEqual([9, 2, 7, 4])
  })

  it('reports the 95th percentile of unsorted samples as the 20th smallest of 21', () => {
    const shuffled = [8, 21, 3, 15, 1, 12, 19, 6, 10, 17, 2, 14, 20, 5, 9, 18, 4, 13, 7, 16, 11]
    expect(summarizeSamples(shuffled).p95Ms).toBe(20)
  })

  it('reports tied samples by their value, with the rank of the largest at the 95th percentile', () => {
    expect(summarizeSamples([2, 2, 2, 9])).toEqual({ samples: 4, medianMs: 2, p95Ms: 9 })
  })

  it('rounds a reported time up when the third decimal reaches 5 or more', () => {
    expect(summarizeSamples([1.236])).toEqual({ samples: 1, medianMs: 1.24, p95Ms: 1.24 })
  })

  it('rejects an empty list of samples', () => {
    expect(() => summarizeSamples([])).toThrow(/empty/)
  })

  it('rejects a sample that is not a number', () => {
    expect(() => summarizeSamples([1, Number.NaN, 3])).toThrow(/finite/)
  })

  it('rejects an infinite sample', () => {
    expect(() => summarizeSamples([1, Number.POSITIVE_INFINITY, 3])).toThrow(/finite/)
  })

  it('rejects a negative sample', () => {
    expect(() => summarizeSamples([1, -0.5, 3])).toThrow(/zero or more/)
  })
})
