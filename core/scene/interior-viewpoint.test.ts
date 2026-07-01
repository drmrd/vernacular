import { describe, expect, it } from 'vitest'

import type { Point } from '../model/types'
import { isInteriorViewpoint } from './interior-viewpoint'

function point(x: number, y: number): Point {
  return { x, y }
}

// A single axis-aligned square room spanning (0,0)..(4000,4000) in plan mm.
const room: readonly Point[] = [point(0, 0), point(4000, 0), point(4000, 4000), point(0, 4000)]

// A second, disjoint square room spanning (6000,0)..(10000,4000).
const otherRoom: readonly Point[] = [
  point(6000, 0),
  point(10000, 0),
  point(10000, 4000),
  point(6000, 4000),
]

describe('isInteriorViewpoint', () => {
  it('reports a point clearly inside a single room as interior', () => {
    expect(isInteriorViewpoint(point(2000, 2000), [room])).toBe(true)
  })

  it('reports a point clearly outside a single room as not interior', () => {
    expect(isInteriorViewpoint(point(5000, 2000), [room])).toBe(false)
  })

  it('reports no viewpoint as interior when there are no rooms', () => {
    expect(isInteriorViewpoint(point(2000, 2000), [])).toBe(false)
  })

  it('reports a point inside any one of several rooms as interior', () => {
    // The point sits inside the second room and outside the first.
    expect(isInteriorViewpoint(point(8000, 2000), [room, otherRoom])).toBe(true)
  })

  it('reports a point outside every room in a multi-room set as not interior', () => {
    // The gap between the two disjoint rooms is exterior to both.
    expect(isInteriorViewpoint(point(5000, 2000), [room, otherRoom])).toBe(false)
  })

  it('treats a point on a room edge or corner as interior (boundary-inclusive)', () => {
    // Boundary convention matches pointInPolygon: an edge or vertex counts as inside.
    expect(isInteriorViewpoint(point(2000, 0), [room])).toBe(true)
    expect(isInteriorViewpoint(point(0, 0), [room])).toBe(true)
  })
})
