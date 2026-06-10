import { describe, expect, it } from 'vitest'
import { getEntry } from './registry'
import { STYLE_REGISTRY_VERSION, builtinStyles } from './styles'

describe('builtin styles', () => {
  it('seeds the MVP styles with their academic or vernacular category', () => {
    expect(builtinStyles.version).toBe(STYLE_REGISTRY_VERSION)
    expect(getEntry(builtinStyles, 'queen-anne')?.category).toBe('academic')
    expect(getEntry(builtinStyles, 'folk-victorian')?.category).toBe('vernacular')
    expect(getEntry(builtinStyles, 'queen-anne')?.displayName['en-US']).toBe('Queen Anne')
  })

  it('marks an academic style that has a recognized vernacular variant', () => {
    const gothicRevival = getEntry(builtinStyles, 'gothic-revival')
    expect(gothicRevival?.category).toBe('academic')
    expect(gothicRevival?.hasVernacularVariant).toBe(true)
  })

  it('seeds the national-folk vernacular forms as first-class vernacular entries', () => {
    for (const id of ['hall-and-parlor', 'i-house', 'gabled-ell', 'shotgun', 'saltbox']) {
      expect(getEntry(builtinStyles, id)?.category).toBe('vernacular')
    }
  })
})
