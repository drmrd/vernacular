import { describe, expect, it } from 'vitest'
import { getEntry } from './registry'
import {
  CONSTRUCTION_PROFILE_REGISTRY_VERSION,
  builtinConstructionProfiles,
  type ConstructionSystem,
} from './construction-profiles'

const NAMED_SYSTEMS: readonly ConstructionSystem[] = [
  'platform-frame',
  'balloon-frame',
  'solid-masonry',
]

describe('builtin construction profiles', () => {
  it('versions the registry and seeds a profile for every named structural system', () => {
    expect(builtinConstructionProfiles.version).toBe(CONSTRUCTION_PROFILE_REGISTRY_VERSION)
    const systems = new Set(
      Object.values(builtinConstructionProfiles.entries).map((entry) => entry.system),
    )
    for (const system of NAMED_SYSTEMS) {
      expect(systems.has(system)).toBe(true)
    }
  })

  it('carries an ordered list of material layers with a thickness on each profile', () => {
    const assembly = getEntry(builtinConstructionProfiles, 'balloon-framed-lath-and-plaster')
    expect(assembly?.system).toBe('balloon-frame')
    expect(assembly?.layers.length).toBeGreaterThan(1)
    // The interior face is plastered, the way a Victorian lath-and-plaster wall is.
    expect(assembly?.layers[0]?.material).toBe('plaster')
    for (const layer of assembly?.layers ?? []) {
      expect(layer.thickness).toBeGreaterThan(0)
      expect(typeof layer.material).toBe('string')
    }
  })

  it('gives every seeded assembly at least one positive-thickness layer', () => {
    for (const entry of Object.values(builtinConstructionProfiles.entries)) {
      expect(entry.layers.length).toBeGreaterThan(0)
      for (const layer of entry.layers) {
        expect(layer.thickness).toBeGreaterThan(0)
        expect(layer.material.length).toBeGreaterThan(0)
      }
    }
  })
})
