import { describe, expect, it } from 'vitest'
import { roundToDecimalPlaces, roundToNearestFraction } from './precision'

describe('roundToDecimalPlaces', () => {
  it('rounds to the requested number of decimal places', () => {
    expect(roundToDecimalPlaces(6.66666, 3)).toBe(6.667)
  })

  it('rounds to a whole number when zero places are requested', () => {
    expect(roundToDecimalPlaces(2030.4, 0)).toBe(2030)
  })

  it('rounds a positive half away from zero', () => {
    expect(roundToDecimalPlaces(2.5, 0)).toBe(3)
  })

  it('rounds a negative half away from zero rather than toward positive infinity', () => {
    expect(roundToDecimalPlaces(-2.5, 0)).toBe(-3)
  })
})

describe('roundToNearestFraction', () => {
  it('reduces an exact fraction to lowest terms', () => {
    expect(roundToNearestFraction(8.5, 16)).toEqual({
      whole: 8,
      numerator: 1,
      denominator: 2,
    })
  })

  it('reports a zero numerator over a unit denominator for a whole value', () => {
    expect(roundToNearestFraction(8.0, 16)).toEqual({
      whole: 8,
      numerator: 0,
      denominator: 1,
    })
  })

  it('carries a rounded-up fraction into the whole part', () => {
    expect(roundToNearestFraction(11.97, 16)).toEqual({
      whole: 12,
      numerator: 0,
      denominator: 1,
    })
  })

  it('reduces a fraction against a non-power-of-two-friendly denominator', () => {
    expect(roundToNearestFraction(8.25, 8)).toEqual({
      whole: 8,
      numerator: 1,
      denominator: 4,
    })
  })
})
