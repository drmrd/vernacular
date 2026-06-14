import { describe, expect, it } from 'vitest'
import type { Point } from '../model/types'
import { insetPolygon, outsetPolygon, pointInPolygon, polygonArea } from './polygon'

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

describe('insetPolygon', () => {
  const counterClockwiseRectangle: Point[] = [
    { x: 0, y: 0 },
    { x: 1000, y: 0 },
    { x: 1000, y: 600 },
    { x: 0, y: 600 },
  ]

  const containsCorner = (corners: readonly Point[], expected: Point): boolean =>
    corners.some((corner) => corner.x === expected.x && corner.y === expected.y)

  it('insets a counter-clockwise rectangle uniformly toward its interior', () => {
    const inset = insetPolygon(counterClockwiseRectangle, [57, 57, 57, 57])

    expect(inset).toEqual([
      { x: 57, y: 57 },
      { x: 943, y: 57 },
      { x: 943, y: 543 },
      { x: 57, y: 543 },
    ])
  })

  it('insets toward the interior regardless of input winding by normalizing it', () => {
    const clockwiseRectangle: Point[] = [
      { x: 0, y: 0 },
      { x: 0, y: 600 },
      { x: 1000, y: 600 },
      { x: 1000, y: 0 },
    ]

    const inset = insetPolygon(clockwiseRectangle, [57, 57, 57, 57])

    expect(inset).toHaveLength(4)
    expect(containsCorner(inset, { x: 57, y: 57 })).toBe(true)
    expect(containsCorner(inset, { x: 943, y: 57 })).toBe(true)
    expect(containsCorner(inset, { x: 943, y: 543 })).toBe(true)
    expect(containsCorner(inset, { x: 57, y: 543 })).toBe(true)
  })

  it('insets each edge inward by its own offset when offsets differ', () => {
    const inset = insetPolygon(counterClockwiseRectangle, [100, 50, 100, 50])

    expect(inset).toEqual([
      { x: 50, y: 100 },
      { x: 950, y: 100 },
      { x: 950, y: 500 },
      { x: 50, y: 500 },
    ])
  })
})

describe('outsetPolygon', () => {
  const counterClockwiseRectangle: Point[] = [
    { x: 0, y: 0 },
    { x: 1000, y: 0 },
    { x: 1000, y: 600 },
    { x: 0, y: 600 },
  ]

  const containsCorner = (corners: readonly Point[], expected: Point): boolean =>
    corners.some((corner) => corner.x === expected.x && corner.y === expected.y)

  it('outsets a counter-clockwise rectangle uniformly toward its exterior', () => {
    const outset = outsetPolygon(counterClockwiseRectangle, [57, 57, 57, 57])

    expect(outset).toEqual([
      { x: -57, y: -57 },
      { x: 1057, y: -57 },
      { x: 1057, y: 657 },
      { x: -57, y: 657 },
    ])
  })

  it('outsets toward the exterior regardless of input winding by normalizing it', () => {
    const clockwiseRectangle: Point[] = [
      { x: 0, y: 0 },
      { x: 0, y: 600 },
      { x: 1000, y: 600 },
      { x: 1000, y: 0 },
    ]

    const outset = outsetPolygon(clockwiseRectangle, [57, 57, 57, 57])

    expect(outset).toHaveLength(4)
    expect(containsCorner(outset, { x: -57, y: -57 })).toBe(true)
    expect(containsCorner(outset, { x: 1057, y: -57 })).toBe(true)
    expect(containsCorner(outset, { x: 1057, y: 657 })).toBe(true)
    expect(containsCorner(outset, { x: -57, y: 657 })).toBe(true)
  })

  it('outsets each edge outward by its own offset when offsets differ', () => {
    const outset = outsetPolygon(counterClockwiseRectangle, [100, 50, 100, 50])

    expect(outset).toEqual([
      { x: -50, y: -100 },
      { x: 1050, y: -100 },
      { x: 1050, y: 700 },
      { x: -50, y: 700 },
    ])
  })
})
