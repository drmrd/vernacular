import { describe, expect, it } from 'vitest'
import { furnitureFootprintCorners } from './furniture-footprint'
import type { FurnitureFootprint, Point } from './types'

const footprint: FurnitureFootprint = { width: 600, depth: 400 }

describe('furnitureFootprintCorners', () => {
  it('returns the axis-aligned half-extent corners in symbol winding order at rotation 0', () => {
    const corners = furnitureFootprintCorners({ x: 0, y: 0 }, 0, footprint)

    const expected: Point[] = [
      { x: -300, y: -200 },
      { x: 300, y: -200 },
      { x: 300, y: 200 },
      { x: -300, y: 200 },
    ]
    for (let index = 0; index < expected.length; index += 1) {
      expect(corners[index]?.x).toBeCloseTo(expected[index]?.x ?? Number.NaN)
      expect(corners[index]?.y).toBeCloseTo(expected[index]?.y ?? Number.NaN)
    }
  })

  it('swaps the footprint axes under a 90 degree rotation', () => {
    const corners = furnitureFootprintCorners({ x: 0, y: 0 }, 90, footprint)

    // The 600 mm width now runs along y (|y| ~= 300) and the 400 mm depth
    // along x (|x| ~= 200). Assert the absolute extents so the test does not
    // depend on the rotation-direction convention of the underlying helper.
    for (let index = 0; index < corners.length; index += 1) {
      expect(Math.abs(corners[index]?.x ?? Number.NaN)).toBeCloseTo(200)
      expect(Math.abs(corners[index]?.y ?? Number.NaN)).toBeCloseTo(300)
    }

    const keys = new Set(corners.map((corner: Point) => `${corner.x},${corner.y}`))
    expect(keys.size).toBe(4)
  })

  it('offsets all four corners by a nonzero center position', () => {
    const corners = furnitureFootprintCorners({ x: 1000, y: 500 }, 0, footprint)

    const expected: Point[] = [
      { x: 700, y: 300 },
      { x: 1300, y: 300 },
      { x: 1300, y: 700 },
      { x: 700, y: 700 },
    ]
    for (let index = 0; index < expected.length; index += 1) {
      expect(corners[index]?.x).toBeCloseTo(expected[index]?.x ?? Number.NaN)
      expect(corners[index]?.y).toBeCloseTo(expected[index]?.y ?? Number.NaN)
    }
  })
})
