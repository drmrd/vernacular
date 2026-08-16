import { describe, expect, it } from 'vitest'
import { colorFromHex } from './color'
import {
  COLOR_ACCURACY_SWATCHES,
  COLOR_ACCURACY_TOLERANCE,
  TONE_MAP_EXTREME_NEUTRAL_CHROMA_BOUND,
  TONE_MAP_EXTREME_SWATCHES,
  TONE_MAP_EXTREME_TOLERANCE,
  withinColorTolerance,
} from './color-accuracy'
import {
  TONE_MAP_EXTREME_NEUTRAL_CHROMA_BOUND as BARREL_TONE_MAP_EXTREME_NEUTRAL_CHROMA_BOUND,
  TONE_MAP_EXTREME_SWATCHES as BARREL_TONE_MAP_EXTREME_SWATCHES,
  TONE_MAP_EXTREME_TOLERANCE as BARREL_TONE_MAP_EXTREME_TOLERANCE,
} from '../index'

describe('color-accuracy swatches and tolerance', () => {
  it('defines the three named swatches used by the color-accuracy gate', () => {
    expect(COLOR_ACCURACY_SWATCHES.map((swatch) => swatch.color.srgbHex)).toEqual([
      '#808080',
      '#cc6633',
      '#3f7f5f',
    ])
    expect(COLOR_ACCURACY_SWATCHES.map((swatch) => swatch.name)).toEqual([
      'Neutral mid-gray',
      'Warm saturated',
      'Cool saturated',
    ])
  })

  it('reports a color within tolerance of itself', () => {
    const gray = colorFromHex('#808080')
    expect(withinColorTolerance(gray, gray)).toBe(true)
  })

  it('reports a color out of tolerance of an unrelated hue', () => {
    expect(withinColorTolerance(colorFromHex('#cc6633'), colorFromHex('#3f7f5f'))).toBe(false)
  })

  it('reports a color out of tolerance of a much darker value', () => {
    expect(withinColorTolerance(colorFromHex('#808080'), colorFromHex('#3a3a3a'))).toBe(false)
  })

  it('honors an explicit tolerance argument', () => {
    const reference = colorFromHex('#808080')
    const sample = colorFromHex('#8a8a8a')
    expect(withinColorTolerance(sample, reference, 0)).toBe(false)
    expect(withinColorTolerance(sample, reference, 1)).toBe(true)
  })

  it('defines a positive default tolerance', () => {
    expect(COLOR_ACCURACY_TOLERANCE).toBeGreaterThan(0)
  })
})

describe('tone-map-extreme swatches and tolerance', () => {
  it('defines exactly two tone-map-extreme swatches with the pinned near-white and near-black colors', () => {
    expect(TONE_MAP_EXTREME_SWATCHES).toHaveLength(2)
    expect(TONE_MAP_EXTREME_SWATCHES.map((swatch) => swatch.name)).toEqual([
      'Near-white',
      'Near-black',
    ])
    expect(TONE_MAP_EXTREME_SWATCHES.map((swatch) => swatch.paint.srgbHex)).toEqual([
      '#f0f0ea',
      '#262626',
    ])
    expect(TONE_MAP_EXTREME_SWATCHES.map((swatch) => swatch.reference.srgbHex)).toEqual([
      '#f0f0ea',
      '#080808',
    ])
    expect(
      TONE_MAP_EXTREME_SWATCHES.map((swatch) => swatch.reference.srgbHex === swatch.paint.srgbHex),
    ).toEqual([true, false])
    expect(TONE_MAP_EXTREME_SWATCHES.map((swatch) => swatch.neutralHue)).toEqual([false, true])
  })

  it('defines a tone-map-extreme tolerance tighter than the mid-range color-accuracy tolerance', () => {
    expect(TONE_MAP_EXTREME_TOLERANCE).toBe(0.04)
    expect(TONE_MAP_EXTREME_TOLERANCE).toBeGreaterThan(0)
    expect(TONE_MAP_EXTREME_TOLERANCE).toBeLessThan(COLOR_ACCURACY_TOLERANCE)
  })

  it('defines a positive neutral-hue chroma bound for the tone-map-extreme gate', () => {
    expect(TONE_MAP_EXTREME_NEUTRAL_CHROMA_BOUND).toBe(0.01)
    expect(TONE_MAP_EXTREME_NEUTRAL_CHROMA_BOUND).toBeGreaterThan(0)
  })

  it('re-exports the tone-map-extreme constants from the core barrel', () => {
    expect(BARREL_TONE_MAP_EXTREME_SWATCHES).toBeDefined()
    expect(BARREL_TONE_MAP_EXTREME_SWATCHES).toBe(TONE_MAP_EXTREME_SWATCHES)
    expect(BARREL_TONE_MAP_EXTREME_TOLERANCE).toBeDefined()
    expect(BARREL_TONE_MAP_EXTREME_TOLERANCE).toBe(TONE_MAP_EXTREME_TOLERANCE)
    expect(BARREL_TONE_MAP_EXTREME_NEUTRAL_CHROMA_BOUND).toBeDefined()
    expect(BARREL_TONE_MAP_EXTREME_NEUTRAL_CHROMA_BOUND).toBe(TONE_MAP_EXTREME_NEUTRAL_CHROMA_BOUND)
  })

  it('finds the pinned near-black reference far outside the tone-map-extreme tolerance of its raw-albedo paint', () => {
    expect(
      withinColorTolerance(
        colorFromHex('#080808'),
        colorFromHex('#262626'),
        TONE_MAP_EXTREME_TOLERANCE,
      ),
    ).toBe(false)
  })

  it('finds the near-white paint within the tone-map-extreme tolerance of itself', () => {
    const nearWhite = colorFromHex('#f0f0ea')
    expect(withinColorTolerance(nearWhite, nearWhite, TONE_MAP_EXTREME_TOLERANCE)).toBe(true)
  })

  it('rejects mutation of the readonly tone-map-extreme swatch list', () => {
    // @ts-expect-error the swatch list is readonly and rejects push
    TONE_MAP_EXTREME_SWATCHES.push(TONE_MAP_EXTREME_SWATCHES[0])
  })
})
