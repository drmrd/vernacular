import { describe, expect, it } from 'vitest'
import type { ConstructionLayer } from '../registries/construction-profiles'
import {
  constructionTotalThickness,
  effectiveWallThickness,
  resolveConstructionProfile,
} from './construction-profile'

describe('constructionTotalThickness', () => {
  it('sums the layer thicknesses into the total assembly thickness', () => {
    const layers: readonly ConstructionLayer[] = [
      { material: 'drywall', thickness: 13 },
      { material: 'stud-cavity', thickness: 89 },
      { material: 'drywall', thickness: 13 },
    ]

    expect(constructionTotalThickness(layers)).toBe(115)
  })

  it('treats an empty assembly as zero thickness', () => {
    expect(constructionTotalThickness([])).toBe(0)
  })
})

describe('effectiveWallThickness', () => {
  it('returns the raw thickness when the node carries no profile', () => {
    expect(effectiveWallThickness({ thickness: 120 })).toBe(120)
  })

  it('returns the resolved assembly total thickness for a known profile', () => {
    const node = { thickness: 120, constructionProfile: 'solid-masonry-brick' }
    expect(effectiveWallThickness(node)).toBe(
      resolveConstructionProfile('solid-masonry-brick')?.totalThickness,
    )
  })

  it('falls back to raw thickness for an unknown profile id', () => {
    expect(effectiveWallThickness({ thickness: 120, constructionProfile: 'no-such-id' })).toBe(120)
  })
})
