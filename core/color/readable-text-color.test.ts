import { describe, it, expect } from 'vitest'

import { contrastRatio } from './contrast'
import { readableTextColor } from './readable-text-color'

const AA_NORMAL = 4.5

const VELLUM_50 = '#fbf7ef'
const UMBER_900 = '#2f2615'
const CLAY_500 = '#9c5f4a'

describe('readableTextColor', () => {
  it('returns the light candidate when it has higher contrast on a dark mid-tone fill', () => {
    expect(readableTextColor(CLAY_500, { light: VELLUM_50, dark: UMBER_900 })).toBe(VELLUM_50)
  })

  it('returns the dark candidate when it has higher contrast on a light fill', () => {
    expect(readableTextColor(VELLUM_50, { light: VELLUM_50, dark: UMBER_900 })).toBe(UMBER_900)
  })

  it('returns a label color that clears WCAG AA on a fill that admits one', () => {
    const labelColor = readableTextColor(CLAY_500, { light: VELLUM_50, dark: UMBER_900 })
    expect(contrastRatio(labelColor, CLAY_500)).toBeGreaterThanOrEqual(AA_NORMAL)
  })
})
