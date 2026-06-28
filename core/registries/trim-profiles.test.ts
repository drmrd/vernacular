import { describe, expect, it } from 'vitest'
import { getEntry } from './registry'
import {
  TRIM_PROFILE_REGISTRY_VERSION,
  builtinTrimProfiles,
  type TrimCategory,
} from './trim-profiles'

const NAMED_TRIM_RUNS: readonly TrimCategory[] = [
  'casing',
  'baseboard',
  'crown',
  'chair-rail',
  'picture-rail',
  'wainscot-cap',
]

describe('builtin trim profiles', () => {
  it('versions the registry and seeds a profile for every named trim run', () => {
    expect(builtinTrimProfiles.version).toBe(TRIM_PROFILE_REGISTRY_VERSION)
    const categories = new Set(
      Object.values(builtinTrimProfiles.entries).map((entry) => entry.category),
    )
    for (const category of NAMED_TRIM_RUNS) {
      expect(categories.has(category)).toBe(true)
    }
  })

  it('carries a cross-section shape and stock dimensions on each profile', () => {
    const crown = getEntry(builtinTrimProfiles, 'crown-cove')
    expect(crown?.category).toBe('crown')
    expect(crown?.shape).toBe('cove')
    expect(crown?.height).toBeGreaterThan(0)
    expect(crown?.projection).toBeGreaterThan(0)
  })

  it('keeps every profile projection within its height so quarter-round sections stay circular', () => {
    for (const entry of Object.values(builtinTrimProfiles.entries)) {
      expect(entry.projection).toBeLessThanOrEqual(entry.height)
    }
  })
})
