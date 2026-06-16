import { describe, it, expect } from 'vitest'
import { hitTestFurniture } from './hit-test-furniture'
import { createFurnitureInstance, type FurnitureInstance, type Point } from '../../core'

const ASSET_REF = { scope: 'user' as const, contentHash: 'h' }

// A centered square footprint has half-extents of footprint / 2, so a 600 mm
// square at the origin spans +/-300 in both axes.
const SQUARE_FOOTPRINT = { width: 600, depth: 600 }

function furnitureAt(
  id: string,
  overrides: Partial<{ footprint: FurnitureInstance['footprint']; rotation: number }> = {},
): FurnitureInstance {
  return createFurnitureInstance({
    id,
    assetRef: ASSET_REF,
    position: { x: 0, y: 0 },
    footprint: overrides.footprint ?? SQUARE_FOOTPRINT,
    ...(overrides.rotation !== undefined ? { rotation: overrides.rotation } : {}),
  })
}

describe('hitTestFurniture', () => {
  it("returns the furniture's id when the point lies inside its footprint", () => {
    const point: Point = { x: 100, y: 100 }

    expect(hitTestFurniture([furnitureAt('a')], point)).toBe('a')
  })

  it('returns null when the point lies outside every footprint', () => {
    // x = 400 is beyond the 300 mm half-extent of the 600 mm square.
    const point: Point = { x: 400, y: 0 }

    expect(hitTestFurniture([furnitureAt('a')], point)).toBeNull()
  })

  it('returns the topmost (later-drawn) furniture when footprints overlap', () => {
    const stacked = [furnitureAt('a'), furnitureAt('b')]
    const point: Point = { x: 0, y: 0 }

    expect(hitTestFurniture(stacked, point)).toBe('b')
  })

  it('tests against the rotated footprint, swapping the axis extents on a quarter turn', () => {
    // A 1000 x 200 footprint turned 90 degrees about its center reaches +/-100
    // in x (half the depth) and +/-500 in y (half the width).
    const rotated = [furnitureAt('c', { footprint: { width: 1000, depth: 200 }, rotation: 90 })]

    expect(hitTestFurniture(rotated, { x: 0, y: 400 })).toBe('c')
    expect(hitTestFurniture(rotated, { x: 400, y: 0 })).toBeNull()
  })

  it('returns null for an empty furniture list', () => {
    expect(hitTestFurniture([], { x: 0, y: 0 })).toBeNull()
  })
})
