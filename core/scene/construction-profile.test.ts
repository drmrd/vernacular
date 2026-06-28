import { describe, expect, it } from 'vitest'
import type { ConstructionLayer } from '../registries/construction-profiles'
import { constructionTotalThickness } from './construction-profile'

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
