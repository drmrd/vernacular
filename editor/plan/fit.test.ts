import { describe, it, expect } from 'vitest'
import { contentBounds } from './fit'

describe('contentBounds', () => {
  it('returns the axis-aligned bounds of the points', () => {
    expect(
      contentBounds([
        { x: 0, y: 0 },
        { x: 4000, y: 0 },
        { x: 4000, y: 3000 },
        { x: 1000, y: -500 },
      ]),
    ).toEqual({ min: { x: 0, y: -500 }, max: { x: 4000, y: 3000 } })
  })

  it('returns null when there are no points', () => {
    expect(contentBounds([])).toBeNull()
  })
})
