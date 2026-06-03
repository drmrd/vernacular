import { describe, expect, it } from 'vitest'
import { getEntry } from './registry'
import { FINISH_REGISTRY_VERSION, builtinFinishes } from './finishes'

describe('builtin finishes', () => {
  it('seeds the six standard paint finishes', () => {
    expect(Object.keys(builtinFinishes.entries)).toHaveLength(6)
    expect(builtinFinishes.version).toBe(FINISH_REGISTRY_VERSION)
  })

  it('maps gloss to a low roughness and high sheen', () => {
    const gloss = getEntry(builtinFinishes, 'gloss')
    expect(gloss?.roughness).toBeLessThan(0.2)
    expect(gloss?.sheen).toBeGreaterThan(0.5)
  })
})
