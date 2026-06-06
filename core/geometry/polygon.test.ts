import { describe, expect, it } from 'vitest'
import { pointInPolygon, polygonArea } from './polygon'

describe('polygonArea', () => {
  it('returns the signed shoelace area, positive for counter-clockwise winding', () => {
    const counterClockwiseRectangle = [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 3000 },
      { x: 0, y: 3000 },
    ]

    expect(polygonArea(counterClockwiseRectangle)).toBe(12_000_000)
  })

  it('negates the signed area for clockwise winding of the same rectangle', () => {
    const clockwiseRectangle = [
      { x: 0, y: 0 },
      { x: 0, y: 3000 },
      { x: 4000, y: 3000 },
      { x: 4000, y: 0 },
    ]

    expect(polygonArea(clockwiseRectangle)).toBe(-12_000_000)
  })
})

describe('pointInPolygon', () => {
  const rectangle = [
    { x: 0, y: 0 },
    { x: 4000, y: 0 },
    { x: 4000, y: 3000 },
    { x: 0, y: 3000 },
  ]

  it('classifies a point strictly inside the polygon as inside', () => {
    expect(pointInPolygon({ x: 2000, y: 1500 }, rectangle)).toBe(true)
  })

  it('classifies a point outside the polygon as outside', () => {
    expect(pointInPolygon({ x: 5000, y: 1500 }, rectangle)).toBe(false)
  })

  it('counts a point lying on an edge as inside', () => {
    // Documented boundary rule: a point on an edge counts as inside.
    expect(pointInPolygon({ x: 2000, y: 0 }, rectangle)).toBe(true)
  })

  it('classifies a point in the reflex notch of an L-shaped polygon as outside', () => {
    const lShape = [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 2000 },
      { x: 2000, y: 2000 },
      { x: 2000, y: 4000 },
      { x: 0, y: 4000 },
    ]

    expect(pointInPolygon({ x: 3000, y: 3000 }, lShape)).toBe(false)
    expect(pointInPolygon({ x: 1000, y: 3000 }, lShape)).toBe(true)
  })
})
