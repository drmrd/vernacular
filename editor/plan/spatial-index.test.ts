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
