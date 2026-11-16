import { describe, expect, it } from 'vitest'
import { COLOR_CHECK_SUN_LEVEL, colorCheckLighting, NEUTRAL_REFERENCE_WHITE } from './color-check'
import {
  NEUTRAL_DOME_SPHERICAL_HARMONICS,
  projectDomeToSphericalHarmonics,
} from './spherical-harmonics'
import type { EnvironmentLighting } from './environment-lighting'

// A deliberately non-axis direction, so a test that forgets to pass the
// direction through untouched cannot pass by coincidence with a trivial
// {0, 0, 1}-style vector.
const TINTED_SUN_DIRECTION = { x: 0.6, y: 0.75, z: -0.28 }

// A fractional level distinct from 0, 1 and the color check level, so a
// pass-through of the incoming level would fail the pinning tests.
const PARTIAL_SUN_LEVEL = 0.42

const BELOW_HORIZON_SUN_DIRECTION = { x: 0.6, y: -0.2, z: -0.28 }
const ON_HORIZON_SUN_DIRECTION = { x: 0.6, y: 0, z: -0.28 }
const OVERCAST_CLOUD_COVER = 1

// A non-neutral cloud cover and its projected sky ambient, so a test that
// forgets to neutralize skyAmbient cannot pass by coincidence with an
// already-neutral fixture.
const TINTED_CLOUD_COVER = 0.6
const TINTED_SKY_AMBIENT = projectDomeToSphericalHarmonics({
  sunDirection: TINTED_SUN_DIRECTION,
  cloudCover: TINTED_CLOUD_COVER,
})

function tintedLighting(sunLevel: number): EnvironmentLighting {
  return {
    sunDirection: TINTED_SUN_DIRECTION,
    sunColor: { r: 1, g: 0.6, b: 0.3 },
    skyColor: { r: 0.4, g: 0.5, b: 0.9 },
    sunLevel,
    cloudCover: TINTED_CLOUD_COVER,
    skyAmbient: TINTED_SKY_AMBIENT,
  }
}

describe('colorCheckLighting', () => {
  it('replaces the sun and sky tints with the neutral reference white', () => {
    const neutralized = colorCheckLighting(tintedLighting(PARTIAL_SUN_LEVEL))

    expect(neutralized.sunColor).toEqual(NEUTRAL_REFERENCE_WHITE)
    expect(neutralized.skyColor).toEqual(NEUTRAL_REFERENCE_WHITE)
  })

  it('leaves the sun direction unchanged', () => {
    const neutralized = colorCheckLighting(tintedLighting(PARTIAL_SUN_LEVEL))

    expect(neutralized.sunDirection).toEqual(TINTED_SUN_DIRECTION)
  })

  it('pins the sun level at the color check level whatever fractional level came in', () => {
    const neutralized = colorCheckLighting(tintedLighting(PARTIAL_SUN_LEVEL))

    expect(COLOR_CHECK_SUN_LEVEL).toBe(1.6)
    expect(neutralized.sunLevel).toBe(COLOR_CHECK_SUN_LEVEL)
  })

  it('gives the same sun level under clear and overcast skies', () => {
    const overcast = colorCheckLighting({
      ...tintedLighting(PARTIAL_SUN_LEVEL),
      cloudCover: OVERCAST_CLOUD_COVER,
    })

    expect(overcast.sunLevel).toBe(COLOR_CHECK_SUN_LEVEL)
  })

  it('turns the sun off when its direction points below the horizon', () => {
    const neutralized = colorCheckLighting({
      ...tintedLighting(PARTIAL_SUN_LEVEL),
      sunDirection: BELOW_HORIZON_SUN_DIRECTION,
    })

    expect(neutralized.sunLevel).toBe(0)
  })

  it('turns the sun off when its direction lies exactly on the horizon', () => {
    const neutralized = colorCheckLighting({
      ...tintedLighting(PARTIAL_SUN_LEVEL),
      sunDirection: ON_HORIZON_SUN_DIRECTION,
    })

    expect(neutralized.sunLevel).toBe(0)
  })

  it('replaces the sky ambient with the neutral dome spherical harmonics', () => {
    const neutralized = colorCheckLighting(tintedLighting(PARTIAL_SUN_LEVEL))

    expect(neutralized.skyAmbient).toEqual(NEUTRAL_DOME_SPHERICAL_HARMONICS)
  })
})

describe('NEUTRAL_REFERENCE_WHITE', () => {
  it('is fully saturated white in linear-light sRGB', () => {
    expect(NEUTRAL_REFERENCE_WHITE).toEqual({ r: 1, g: 1, b: 1 })
  })
})
