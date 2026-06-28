import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FLOOR_TO_FLOOR_MM,
  ordinalLabel,
  planBasement,
  planUpperFloor,
} from './floor-placement'

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

describe('planUpperFloor', () => {
  it('names the first floor above the ground "2nd Floor" and lifts it one storey', () => {
    expect(planUpperFloor([0])).toEqual({
      name: '2nd Floor',
      elevation: DEFAULT_FLOOR_TO_FLOOR_MM,
    })
  })

  it('keeps counting upward and stacks above the highest existing floor', () => {
    expect(planUpperFloor([0, DEFAULT_FLOOR_TO_FLOOR_MM])).toEqual({
      name: '3rd Floor',
      elevation: 2 * DEFAULT_FLOOR_TO_FLOOR_MM,
    })
  })

  it('ignores basements when numbering and placing the next upper floor', () => {
    expect(planUpperFloor([-DEFAULT_FLOOR_TO_FLOOR_MM, 0])).toEqual({
      name: '2nd Floor',
      elevation: DEFAULT_FLOOR_TO_FLOOR_MM,
    })
  })
})

describe('planBasement', () => {
  it('names the first floor below the ground "Basement" at a negative elevation', () => {
    expect(planBasement([0])).toEqual({
      name: 'Basement',
      elevation: -DEFAULT_FLOOR_TO_FLOOR_MM,
    })
  })

  it('names the next level down "Sub-basement" and drops it a further storey', () => {
    expect(planBasement([0, -DEFAULT_FLOOR_TO_FLOOR_MM])).toEqual({
      name: 'Sub-basement',
      elevation: -2 * DEFAULT_FLOOR_TO_FLOOR_MM,
    })
  })

  it('prefixes each additional level downward with another "Sub-"', () => {
    expect(planBasement([0, -DEFAULT_FLOOR_TO_FLOOR_MM, -2 * DEFAULT_FLOOR_TO_FLOOR_MM])).toEqual({
      name: 'Sub-sub-basement',
      elevation: -3 * DEFAULT_FLOOR_TO_FLOOR_MM,
    })
  })
})
