import { describe, expect, it } from 'vitest'
import type { Point } from '../model/types'
import { createStair } from '../model/factories'
import { stairWellPolygon } from './stair-well'

function ascending(values: number[]): number[] {
  return [...values].sort((a, b) => a - b)
}

describe('stairWellPolygon', () => {
  it('returns an axis-aligned footprint rectangle for a zero-rotation stair', () => {
    const stair = createStair({
      position: { x: 1000, y: 2000 },
      width: 1000,
      length: 3000,
      rotation: 0,
      connection: { fromFloorId: 'floor-ground', toFloorId: 'floor-first' },
    })

    const polygon: Point[] = stairWellPolygon(stair)

    expect(polygon).toHaveLength(4)

    const xs = ascending(polygon.map((point) => point.x))
    const ys = ascending(polygon.map((point) => point.y))

    expect(xs[0]).toBe(1000)
    expect(xs[xs.length - 1]).toBe(2000)
    expect(ys[0]).toBe(2000)
    expect(ys[ys.length - 1]).toBe(5000)
  })
})
