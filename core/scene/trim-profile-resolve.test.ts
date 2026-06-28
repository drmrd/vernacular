import { describe, expect, it } from 'vitest'
import { createRegistry } from '../registries/registry'
import type { TrimProfile } from '../registries/trim-profiles'
import { resolveTrimProfileSection } from './trim-profile'

describe('resolveTrimProfileSection', () => {
  it('resolves a section straight from a builtin registry profile id', () => {
    const section = resolveTrimProfileSection('crown-cove')

    expect(section).toBeDefined()
    // The cove crown carries a curved face, so its section includes an arc segment.
    expect(section?.segments.some((segment) => segment.kind === 'arc')).toBe(true)
  })

  it('reads the profile shape and dimensions from a supplied registry', () => {
    const profiles = createRegistry<TrimProfile>(1, [
      { id: 'plain', category: 'casing', shape: 'flat', height: 80, projection: 18 },
    ])

    const section = resolveTrimProfileSection('plain', profiles)

    expect(section).toBeDefined()
    expect(section?.segments.every((segment) => segment.kind === 'line')).toBe(true)
    expect(section?.segments.map((segment) => segment.to.x)).toContain(18)
  })

  it('returns undefined for a profile id the registry does not carry', () => {
    expect(resolveTrimProfileSection('no-such-profile')).toBeUndefined()
  })
})
