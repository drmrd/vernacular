import { describe, expect, it } from 'vitest'
import { ASSET_DOMAIN_REGISTRY_VERSION, builtinAssetDomains } from './asset-domains.ts'
import { getEntry } from './registry.ts'

function placementOf(code: string): { tier: number | undefined; rank: number | undefined } {
  const entry = getEntry(builtinAssetDomains, code)
  return { tier: entry?.tier, rank: entry?.rank }
}

function domainsInTier(tier: number): number {
  return Object.values(builtinAssetDomains.entries).filter((domain) => domain.tier === tier).length
}

describe('builtin asset domains', () => {
  it('lists thirty domains with the tier and rank of the specification', () => {
    expect(Object.keys(builtinAssetDomains.entries)).toHaveLength(30)
    expect(builtinAssetDomains.version).toBe(ASSET_DOMAIN_REGISTRY_VERSION)

    expect(placementOf('SUB')).toEqual({ tier: 1, rank: 10 })
    expect(placementOf('MAT')).toEqual({ tier: 2, rank: 20 })
    expect(placementOf('LYR')).toEqual({ tier: 2, rank: 25 })
    expect(placementOf('FFE')).toEqual({ tier: 3, rank: 30 })
    expect(placementOf('CTX')).toEqual({ tier: 4, rank: 40 })
    expect(placementOf('STY')).toEqual({ tier: 4, rank: 45 })
    expect(placementOf('SCT')).toEqual({ tier: 4, rank: 48 })
    expect(placementOf('SYS')).toEqual({ tier: 4, rank: 48 })

    expect([1, 2, 3, 4].map(domainsInTier)).toEqual([10, 5, 11, 4])

    const ranks = new Set(Object.values(builtinAssetDomains.entries).map((domain) => domain.rank))
    expect([...ranks].sort((a, b) => a - b)).toEqual([10, 20, 25, 30, 40, 45, 48])
  })
})
