import { describe, expect, it } from 'vitest'
import { parseLength } from './parse-length'

describe('parseLength metric inputs', () => {
  it('reads meters with a space before the unit symbol', () => {
    expect(parseLength('2.03 m')).toBe(2030)
  })

  it('reads meters with no space before the unit symbol', () => {
    expect(parseLength('2.03m')).toBe(2030)
  })

  it('reads meters written as a full unit word', () => {
    expect(parseLength('2.03 meters')).toBe(2030)
  })

  it('reads millimeters with a space before the unit symbol', () => {
    expect(parseLength('2030 mm')).toBe(2030)
  })

  it('reads millimeters with no space before the unit symbol', () => {
    expect(parseLength('2030mm')).toBe(2030)
  })

  it('reads millimeters written as a full unit word', () => {
    expect(parseLength('2030 millimeters')).toBe(2030)
  })

  it('reads centimeters with a space before the unit symbol', () => {
    expect(parseLength('203 cm')).toBe(2030)
  })

  it('tolerates surrounding whitespace and an uppercase unit symbol', () => {
    expect(parseLength('  2.03 M ')).toBe(2030)
  })

  it('preserves the sign of a negative metric length', () => {
    expect(parseLength('-2.03 m')).toBe(-2030)
  })
})

describe('parseLength imperial inputs', () => {
  it('reads feet-and-inches with the prime and double-prime symbols', () => {
    expect(parseLength(`6'8"`)).toBe(2032)
  })

  it('reads feet-and-inches with a space between the feet and inches parts', () => {
    expect(parseLength(`6' 8"`)).toBe(2032)
  })

  it('reads feet-and-inches written with compact ft and in abbreviations', () => {
    expect(parseLength('6ft 8in')).toBe(2032)
  })

  it('reads feet-and-inches written with spaced ft and in abbreviations', () => {
    expect(parseLength('6 ft 8 in')).toBe(2032)
  })

  it('reads feet-and-inches written with full feet and inches unit words', () => {
    expect(parseLength('6 feet 8 inches')).toBe(2032)
  })

  it('reads whole inches written with the in abbreviation', () => {
    expect(parseLength('80 in')).toBe(2032)
  })

  it('reads whole inches written with the double-prime symbol', () => {
    expect(parseLength('80"')).toBe(2032)
  })

  it('reads whole inches written as a full unit word', () => {
    expect(parseLength('80 inches')).toBe(2032)
  })

  it('reads decimal feet written with the ft abbreviation', () => {
    expect(parseLength('6.667 ft')).toBeCloseTo(2032.1016, 6)
  })

  it('reads decimal feet written with the prime symbol', () => {
    expect(parseLength(`6.667'`)).toBeCloseTo(2032.1016, 6)
  })

  it('reads whole feet written with the prime symbol', () => {
    expect(parseLength(`6'`)).toBe(1828.8)
  })

  it('preserves the sign of a negative whole-feet length', () => {
    expect(parseLength(`-8'`)).toBe(-2438.4)
  })
})

describe('parseLength imperial fractional-inch inputs', () => {
  it('reads feet with a fractional inch in prime and double-prime notation', () => {
    expect(parseLength(`6'8 1/2"`)).toBe(2044.7)
  })

  it('reads a fractional inch with no feet part in double-prime notation', () => {
    expect(parseLength('8 1/2"')).toBe(215.9)
  })

  it('reads feet with a fractional inch written with full ft and in unit words', () => {
    expect(parseLength('6 ft 8 1/2 in')).toBe(2044.7)
  })

  it('reads a hyphen between the whole inches and the fraction', () => {
    expect(parseLength('8-1/2"')).toBe(215.9)
  })

  it('reads a bare fraction with no whole inches in double-prime notation', () => {
    expect(parseLength('1/2"')).toBe(12.7)
  })
})

describe('parseLength assumed unit for bare numbers', () => {
  it('interprets a bare number as inches when inches are assumed', () => {
    expect(parseLength('80', { assumeUnit: 'in' })).toBe(2032)
  })

  it('interprets a bare number as millimeters when millimeters are assumed', () => {
    expect(parseLength('2030', { assumeUnit: 'mm' })).toBe(2030)
  })

  it('interprets a bare number as feet when feet are assumed', () => {
    expect(parseLength('6', { assumeUnit: 'ft' })).toBe(1828.8)
  })

  it('throws for a bare number when no unit is assumed', () => {
    expect(() => parseLength('80')).toThrow()
  })
})

describe('parseLength error handling', () => {
  it('throws for input that is not a number at all', () => {
    expect(() => parseLength('banana')).toThrow()
  })

  it('throws for empty input', () => {
    expect(() => parseLength('')).toThrow()
  })

  it('throws for a sign with no magnitude', () => {
    expect(() => parseLength('-')).toThrow()
  })

  it('throws for an unknown unit word', () => {
    expect(() => parseLength('6 fathoms')).toThrow()
  })

  it('throws for a fraction with a zero denominator', () => {
    expect(() => parseLength('1/0"')).toThrow()
  })

  it('throws for a malformed inch value with a dangling whole part', () => {
    expect(() => parseLength('8 1"')).toThrow()
  })
})
