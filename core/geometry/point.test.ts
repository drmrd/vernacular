import { describe, expect, it } from 'vitest'
import { distance } from './point'

describe('distance', () => {
  it('returns the Euclidean distance between two points in millimeter plan space', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3000, y: 4000 })).toBe(5000)
  })

  it('returns zero for two coincident points', () => {
    expect(distance({ x: 10, y: 10 }, { x: 10, y: 10 })).toBe(0)
  })
})
