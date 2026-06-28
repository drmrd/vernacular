import { describe, expect, it } from 'vitest'
import { getEntry } from './registry'
import { FLOOR_PATTERN_REGISTRY_VERSION, builtinFloorPatterns } from './floor-patterns'

const SEED_IDS = ['plank', 'tile-grid', 'parquet']

describe('builtin floor patterns', () => {
  it('seeds the plank, tile-grid, and parquet wearing surfaces', () => {
    expect(Object.keys(builtinFloorPatterns.entries)).toEqual(expect.arrayContaining(SEED_IDS))
    expect(builtinFloorPatterns.version).toBe(FLOOR_PATTERN_REGISTRY_VERSION)
  })

  it('gives each pattern a base color, a positive repeat scale, and a roughness', () => {
    for (const id of SEED_IDS) {
      const pattern = getEntry(builtinFloorPatterns, id)
      expect(pattern?.colors.length).toBeGreaterThan(0)
      expect(pattern?.scale).toBeGreaterThan(0)
      expect(pattern?.roughness).toBeGreaterThan(0)
    }
  })

  it('renders tile harder (lower roughness) than a wood plank', () => {
    const tile = getEntry(builtinFloorPatterns, 'tile-grid')
    const plank = getEntry(builtinFloorPatterns, 'plank')
    expect(tile?.roughness).toBeLessThan(plank?.roughness ?? 0)
  })
})
