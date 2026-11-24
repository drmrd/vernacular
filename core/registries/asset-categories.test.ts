import { describe, expect, it } from 'vitest'
import { ASSET_CATEGORY_REGISTRY_VERSION, builtinAssetCategories } from './asset-categories.ts'
import { getEntry } from './registry.ts'

const EXPECTED_COUNTS_BY_DOMAIN = Object.fromEntries([
  ['SUB', 21],
  ['COT', 14],
  ['CLR', 10],
  ['GLZ', 11],
  ['PAT', 12],
  ['RLF', 10],
  ['WTH', 10],
  ['LGT', 8],
  ['VFX', 8],
  ['SYM', 10],
  ['MAT', 13],
  ['PRF', 13],
  ['KIT', 14],
  ['BOT', 12],
  ['LYR', 12],
  ['STR', 14],
  ['ENV', 15],
  ['INT', 15],
  ['HDW', 13],
  ['MEP', 17],
  ['NET', 11],
  ['RGH', 15],
  ['APP', 12],
  ['FFE', 19],
  ['SIT', 12],
  ['LND', 15],
  ['CTX', 15],
  ['STY', 17],
  ['SCT', 17],
  ['SYS', 25],
])

describe('builtinAssetCategories', () => {
  it('holds 410 categories with the count of each domain', () => {
    const entries = Object.values(builtinAssetCategories.entries)
    const countsByDomain: Record<string, number> = {}
    for (const entry of entries) {
      countsByDomain[entry.domain] = (countsByDomain[entry.domain] ?? 0) + 1
    }

    expect(builtinAssetCategories.version).toBe(ASSET_CATEGORY_REGISTRY_VERSION)
    expect(entries).toHaveLength(410)
    expect(countsByDomain).toEqual(EXPECTED_COUNTS_BY_DOMAIN)
    for (const entry of entries) {
      expect(entry.id).toMatch(/^[A-Z]{3}\.[a-z][a-z0-9_]{2,47}$/)
    }
    const seating = getEntry(builtinAssetCategories, 'FFE.seating')
    expect(seating?.domain).toBe('FFE')
    expect(seating?.subcategory).toBe('seating')
  })
})
