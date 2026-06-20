import { describe, expect, it } from 'vitest'
import {
  assertPositiveLength,
  InvalidLengthError,
  MAX_LENGTH_MM,
  MIN_POSITIVE_LENGTH_MM,
} from './length-bounds'

describe('assertPositiveLength', () => {
  it('pins the accepted millimetre bounds', () => {
    expect(MIN_POSITIVE_LENGTH_MM).toBe(1)
    expect(MAX_LENGTH_MM).toBe(100_000)
  })

  it('rejects out-of-range dimensions with an InvalidLengthError', () => {
    expect(() => assertPositiveLength(0, 'Width')).toThrow(InvalidLengthError)
    expect(() => assertPositiveLength(-1, 'Width')).toThrow(InvalidLengthError)
    expect(() => assertPositiveLength(Number.NaN, 'Width')).toThrow(InvalidLengthError)
    expect(() => assertPositiveLength(MAX_LENGTH_MM + 1, 'Width')).toThrow(InvalidLengthError)
  })

  it('accepts a dimension at each edge of the in-range interval', () => {
    expect(() => assertPositiveLength(MIN_POSITIVE_LENGTH_MM, 'Width')).not.toThrow()
    expect(() => assertPositiveLength(MAX_LENGTH_MM, 'Width')).not.toThrow()
  })

  it('carries the label and offending value on the thrown error', () => {
    let caught: unknown
    try {
      assertPositiveLength(-5, 'Thickness')
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(InvalidLengthError)
    const invalid = caught as InvalidLengthError
    expect(invalid.label).toBe('Thickness')
    expect(invalid.valueMm).toBe(-5)
    expect(invalid.message).toContain('Thickness')
    expect(invalid.message.toLowerCase()).toContain('positive length')
  })
})
