import { describe, expect, it } from 'vitest'
import { DEFAULT_FLOOR_SLAB_THICKNESS_MM, floorSlabThickness } from '../../core'

describe('floorSlabThickness', () => {
  it('is the single read point that returns the placeholder slab thickness', () => {
    expect(floorSlabThickness()).toBe(DEFAULT_FLOOR_SLAB_THICKNESS_MM)
  })

  it('places the slab thickness at a positive, finite value', () => {
    expect(Number.isFinite(floorSlabThickness())).toBe(true)
    expect(floorSlabThickness()).toBeGreaterThan(0)
  })
})
