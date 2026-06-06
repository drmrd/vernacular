import { describe, expect, it } from 'vitest'
import { segmentIntersection } from './segment'

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
