import { describe, expect, it } from 'vitest'
import { colorCheckLighting, NEUTRAL_REFERENCE_WHITE } from './color-check'
import type { EnvironmentLighting } from './environment-lighting'

// A deliberately non-axis direction, so a test that forgets to pass the
// direction through untouched cannot pass by coincidence with a trivial
// {0, 0, 1}-style vector.
const TINTED_SUN_DIRECTION = { x: 0.6, y: 0.75, z: -0.28 }

// A fractional intensity distinct from both 0 and 1, so "passes through
// untouched" is observable rather than trivially true of an endpoint.
const PARTIAL_SUN_INTENSITY = 0.42

const NIGHT_SUN_INTENSITY = 0

function tintedLighting(sunIntensity: number): EnvironmentLighting {
  return {
    sunDirection: TINTED_SUN_DIRECTION,
    sunColor: { r: 1, g: 0.6, b: 0.3 },
    skyColor: { r: 0.4, g: 0.5, b: 0.9 },
    sunIntensity,
  }
}

describe('colorCheckLighting', () => {
  it('replaces the sun and sky tints with the neutral reference white', () => {
    const neutralized = colorCheckLighting(tintedLighting(PARTIAL_SUN_INTENSITY))

    expect(neutralized.sunColor).toEqual(NEUTRAL_REFERENCE_WHITE)
    expect(neutralized.skyColor).toEqual(NEUTRAL_REFERENCE_WHITE)
  })

  it('leaves the sun direction unchanged', () => {
    const neutralized = colorCheckLighting(tintedLighting(PARTIAL_SUN_INTENSITY))

    expect(neutralized.sunDirection).toEqual(TINTED_SUN_DIRECTION)
  })

  it('passes a fractional sun intensity through unchanged', () => {
    const neutralized = colorCheckLighting(tintedLighting(PARTIAL_SUN_INTENSITY))

    expect(neutralized.sunIntensity).toBe(PARTIAL_SUN_INTENSITY)
  })

  it('passes a night-time sun intensity of zero through unchanged', () => {
    const neutralized = colorCheckLighting(tintedLighting(NIGHT_SUN_INTENSITY))

    expect(neutralized.sunIntensity).toBe(NIGHT_SUN_INTENSITY)
  })
})

describe('NEUTRAL_REFERENCE_WHITE', () => {
  it('is fully saturated white in linear-light sRGB', () => {
    expect(NEUTRAL_REFERENCE_WHITE).toEqual({ r: 1, g: 1, b: 1 })
  })
})
