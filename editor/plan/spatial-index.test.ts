import { describe, expect, it } from 'vitest'
import { buildSpatialIndex, type IndexedEntity } from './spatial-index'
import type { Bounds } from './fit'

function entity(
  id: string,
  min: { x: number; y: number },
  max: { x: number; y: number },
): IndexedEntity {
  return { id, bounds: { min, max } satisfies Bounds }
}

describe('buildSpatialIndex queryPoint', () => {
  it('returns ids of entities whose bounds contain the point and excludes distant ones', () => {
    const index = buildSpatialIndex([
      entity('near', { x: 0, y: 0 }, { x: 100, y: 100 }),
      entity('far', { x: 1000, y: 1000 }, { x: 1100, y: 1100 }),
    ])

    expect(new Set(index.queryPoint({ x: 50, y: 50 }, 0))).toEqual(new Set(['near']))
  })

  it('returns an entity when the point is outside its bounds but within tolerance', () => {
    const index = buildSpatialIndex([entity('a', { x: 0, y: 0 }, { x: 100, y: 100 })])

    expect(new Set(index.queryPoint({ x: 120, y: 50 }, 50))).toEqual(new Set(['a']))
    expect(index.queryPoint({ x: 120, y: 50 }, 10)).toEqual([])
  })
})

describe('buildSpatialIndex queryBounds', () => {
  it('returns ids of entities intersecting the region and excludes disjoint ones', () => {
    const index = buildSpatialIndex([
      entity('overlapping', { x: 0, y: 0 }, { x: 100, y: 100 }),
      entity('touching', { x: 100, y: 100 }, { x: 200, y: 200 }),
      entity('disjoint', { x: 500, y: 500 }, { x: 600, y: 600 }),
    ])

    const region: Bounds = { min: { x: 50, y: 50 }, max: { x: 150, y: 150 } }

    expect(new Set(index.queryBounds(region))).toEqual(new Set(['overlapping', 'touching']))
  })

  it('returns an empty array from an empty index', () => {
    const index = buildSpatialIndex([])

    expect(index.queryBounds({ min: { x: 0, y: 0 }, max: { x: 100, y: 100 } })).toEqual([])
  })
})
