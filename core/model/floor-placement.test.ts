import { describe, expect, it } from 'vitest'
import { ordinalLabel } from './floor-placement'

describe('ordinalLabel', () => {
  it('labels small cardinals with their English ordinal suffix', () => {
    expect(ordinalLabel(1)).toBe('1st')
    expect(ordinalLabel(2)).toBe('2nd')
    expect(ordinalLabel(3)).toBe('3rd')
    expect(ordinalLabel(4)).toBe('4th')
  })

  it('uses "th" for the eleven-through-thirteen teens regardless of last digit', () => {
    expect(ordinalLabel(11)).toBe('11th')
    expect(ordinalLabel(12)).toBe('12th')
    expect(ordinalLabel(13)).toBe('13th')
    expect(ordinalLabel(111)).toBe('111th')
    expect(ordinalLabel(112)).toBe('112th')
    expect(ordinalLabel(113)).toBe('113th')
  })

  it('resumes the st/nd/rd pattern past the teens', () => {
    expect(ordinalLabel(21)).toBe('21st')
    expect(ordinalLabel(22)).toBe('22nd')
    expect(ordinalLabel(23)).toBe('23rd')
    expect(ordinalLabel(101)).toBe('101st')
  })
})
