import { describe, expect, it } from 'vitest'
import { formatArea } from './format-area'
import { MM_PER_FOOT } from './length-units'
import { DEFAULT_IMPERIAL_PREFERENCES, DEFAULT_METRIC_PREFERENCES } from './preferences'

describe('formatArea metric', () => {
  it('renders square meters with the squared symbol at one decimal place', () => {
    expect(formatArea(12_500_000, DEFAULT_METRIC_PREFERENCES)).toBe('12.5 m²')
  })

  it('drops a trailing zero so a whole result has no decimal part', () => {
    expect(formatArea(20_000_000, DEFAULT_METRIC_PREFERENCES)).toBe('20 m²')
  })

  it('renders a zero area as zero square meters', () => {
    expect(formatArea(0, DEFAULT_METRIC_PREFERENCES)).toBe('0 m²')
  })
})

describe('formatArea imperial', () => {
  it('renders whole square feet with the squared symbol', () => {
    const squareMillimeters = 12_500_000
    const expectedSquareFeet = Math.round(squareMillimeters / MM_PER_FOOT ** 2)

    expect(formatArea(squareMillimeters, DEFAULT_IMPERIAL_PREFERENCES)).toBe(
      `${expectedSquareFeet} ft²`,
    )
  })

  it('renders a zero area as zero square feet', () => {
    expect(formatArea(0, DEFAULT_IMPERIAL_PREFERENCES)).toBe('0 ft²')
  })
})
