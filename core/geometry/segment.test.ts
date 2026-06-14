import { describe, expect, it } from 'vitest'
import { lineIntersection, pointOnSegment, segmentIntersection } from './segment'

describe('segmentIntersection', () => {
  it('returns the crossing point of two segments that intersect', () => {
    expect(
      segmentIntersection({ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }, { x: 100, y: 0 }),
    ).toEqual({ x: 50, y: 50 })
  })

  it('returns null for parallel segments that never meet', () => {
    expect(
      segmentIntersection({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 10 }, { x: 100, y: 10 }),
    ).toBeNull()
  })

  it('returns null for disjoint segments whose extents do not touch', () => {
    expect(
      segmentIntersection({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }),
    ).toBeNull()
  })
})

describe('lineIntersection', () => {
  it('returns the crossing of two infinite lines that meet beyond their anchor points', () => {
    expect(
      lineIntersection({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 5, y: -3 }, { x: 0, y: 1 }),
    ).toEqual({ x: 5, y: 0 })
  })

  it('returns null for parallel lines that never meet', () => {
    expect(
      lineIntersection({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 2 }, { x: 1, y: 0 }),
    ).toBeNull()
  })

  it('returns null for collinear lines', () => {
    expect(
      lineIntersection({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 9, y: 0 }, { x: 2, y: 0 }),
    ).toBeNull()
  })
})

describe('pointOnSegment', () => {
  it('reports a point in the segment interior as on the segment', () => {
    expect(pointOnSegment({ x: 2000, y: 0 }, { x: 0, y: 0 }, { x: 4000, y: 0 }, 1)).toBe(true)
  })

  it('reports a point within tolerance of the segment as on the segment', () => {
    expect(pointOnSegment({ x: 2000, y: 0.5 }, { x: 0, y: 0 }, { x: 4000, y: 0 }, 1)).toBe(true)
  })

  it('reports a point off the segment as not on the segment', () => {
    expect(pointOnSegment({ x: 2000, y: 50 }, { x: 0, y: 0 }, { x: 4000, y: 0 }, 1)).toBe(false)
  })

  it('reports a point beyond the segment end as not on the segment', () => {
    expect(pointOnSegment({ x: 5000, y: 0 }, { x: 0, y: 0 }, { x: 4000, y: 0 }, 1)).toBe(false)
  })
})
