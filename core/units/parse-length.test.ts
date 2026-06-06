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
