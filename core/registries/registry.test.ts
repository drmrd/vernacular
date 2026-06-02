import { describe, expect, it } from 'vitest'
import { createRegistry, getEntry, mergeRegistries, type RegistryEntry } from './registry'

interface Sample extends RegistryEntry {
  label: string
}

function makeBase() {
  return createRegistry<Sample>(1, [
    { id: 'a', label: 'Base A' },
    { id: 'b', label: 'Base B' },
  ])
}

describe('registry pattern', () => {
  it('indexes entries by id', () => {
    expect(getEntry(makeBase(), 'a')?.label).toBe('Base A')
  })

  it('returns undefined for a missing id', () => {
    expect(getEntry(makeBase(), 'missing')).toBeUndefined()
  })

  it('merges overlays so later sources win on id collision', () => {
    const overlay = createRegistry<Sample>(2, [{ id: 'b', label: 'Overlay B' }])
    const merged = mergeRegistries(makeBase(), overlay)

    expect(getEntry(merged, 'a')?.label).toBe('Base A')
    expect(getEntry(merged, 'b')?.label).toBe('Overlay B')
    expect(merged.version).toBe(2)
  })
})
