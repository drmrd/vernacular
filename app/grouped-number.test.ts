import { describe, expect, it } from 'vitest'
import { groupedNumber } from './grouped-number'

describe('groupedNumber', () => {
  it.each([
    [0, '0'],
    [999, '999'],
    [1000, '1,000'],
    [1024, '1,024'],
    [10000, '10,000'],
    [1234567, '1,234,567'],
  ])(
    'writes %i as %s, in groups of three digits from the right with a comma between',
    (value, text) => {
      expect(groupedNumber(value)).toBe(text)
    },
  )
})
