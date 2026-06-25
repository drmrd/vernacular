import { describe, expect, it } from 'vitest'
import { formatEntryMagnitude } from './format-entry-magnitude'

describe('formatEntryMagnitude', () => {
  it('formats exact metric magnitudes with trailing zeros stripped', () => {
    expect(formatEntryMagnitude(1000, 'm')).toBe('1')
    expect(formatEntryMagnitude(1000, 'cm')).toBe('100')
    expect(formatEntryMagnitude(1000, 'mm')).toBe('1000')
    expect(formatEntryMagnitude(900, 'cm')).toBe('90')
    expect(formatEntryMagnitude(80, 'mm')).toBe('80')
  })

  it('formats fractional metric magnitudes up to the per-unit decimal places', () => {
    expect(formatEntryMagnitude(1234, 'm')).toBe('1.234')
    expect(formatEntryMagnitude(1234, 'cm')).toBe('123.4')
  })

  it('formats imperial magnitudes with trailing zeros stripped', () => {
    expect(formatEntryMagnitude(2032, 'in')).toBe('80')
    expect(formatEntryMagnitude(304.8, 'ft')).toBe('1')
  })

  it('formats zero and negative magnitudes cleanly', () => {
    expect(formatEntryMagnitude(0, 'm')).toBe('0')
    expect(formatEntryMagnitude(-1000, 'm')).toBe('-1')
  })
})
