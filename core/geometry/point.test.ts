import { describe, expect, it } from 'vitest'
import { distance, rotatePoint, translatePoint } from './point'

describe('distance', () => {
  it('returns the Euclidean distance between two points in millimeter plan space', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3000, y: 4000 })).toBe(5000)
  })

  it('returns zero for two coincident points', () => {
    expect(distance({ x: 10, y: 10 }, { x: 10, y: 10 })).toBe(0)
  })
})

describe('translatePoint', () => {
  it('offsets the point by the delta components', () => {
    expect(translatePoint({ x: 10, y: 20 }, { x: 3, y: -4 })).toEqual({ x: 13, y: 16 })
  })
})

describe('rotatePoint', () => {
  it('rotates counter-clockwise about the origin in plan space where y increases upward', () => {
    const rotated = rotatePoint({ x: 100, y: 0 }, { x: 0, y: 0 }, Math.PI / 2)
    expect(rotated.x).toBeCloseTo(0)
    expect(rotated.y).toBeCloseTo(100)
  })

  it('returns the original coordinates for a zero-radian rotation', () => {
    const point = { x: 42, y: -17 }
    const rotated = rotatePoint(point, { x: 5, y: 9 }, 0)
    expect(rotated.x).toBeCloseTo(point.x)
    expect(rotated.y).toBeCloseTo(point.y)
  })

  it('rotates in pivot-relative coordinates about a non-origin pivot', () => {
    const rotated = rotatePoint({ x: 110, y: 0 }, { x: 10, y: 0 }, Math.PI / 2)
    expect(rotated.x).toBeCloseTo(10)
    expect(rotated.y).toBeCloseTo(100)
  })
})
