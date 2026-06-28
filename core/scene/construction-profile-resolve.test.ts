import { describe, expect, it } from 'vitest'
import { createRegistry } from '../registries/registry'
import type { ConstructionProfile } from '../registries/construction-profiles'
import { resolveConstructionProfile } from './construction-profile'

describe('resolveConstructionProfile', () => {
  it('resolves ordered layers and a total thickness from a builtin profile id', () => {
    const resolved = resolveConstructionProfile('platform-framed-drywall')

    expect(resolved).toBeDefined()
    // The layers arrive interior face first, drywall over the stud cavity.
    expect(resolved?.layers[0]?.material).toBe('drywall')
    // The total is the sum of the layer thicknesses.
    const summed = resolved?.layers.reduce((total, layer) => total + layer.thickness, 0)
    expect(resolved?.totalThickness).toBe(summed)
  })

  it('reads the layers and thickness from a supplied registry', () => {
    const profiles = createRegistry<ConstructionProfile>(1, [
      {
        id: 'single-wythe',
        system: 'solid-masonry',
        layers: [{ material: 'brick', thickness: 100 }],
      },
    ])

    const resolved = resolveConstructionProfile('single-wythe', profiles)

    expect(resolved?.totalThickness).toBe(100)
    expect(resolved?.layers).toHaveLength(1)
  })

  it('returns undefined for a profile id the registry does not carry', () => {
    expect(resolveConstructionProfile('no-such-profile')).toBeUndefined()
  })
})
