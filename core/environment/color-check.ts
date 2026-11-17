import type { LinearRgb } from '../color/oklab'
import type { EnvironmentLighting } from './environment-lighting'
import { NEUTRAL_DOME_SPHERICAL_HARMONICS } from './spherical-harmonics'

/** The white-balanced reference tint the color check renders under (linear-light sRGB). */
export const NEUTRAL_REFERENCE_WHITE: LinearRgb = { r: 1, g: 1, b: 1 }

/**
 * The sun level the color-accuracy check renders under, held with no horizon fade
 * and no cloud dimming, so the check's reference condition does not depend on the
 * time or the weather (decision record ADR-0156 fixes that condition). Below the
 * horizon the sun is off.
 */
export const COLOR_CHECK_SUN_LEVEL = 1.6

/**
 * Neutralizes the sun and sky tints to the white-balanced reference for the color
 * check: sunColor and skyColor become NEUTRAL_REFERENCE_WHITE, and skyAmbient is
 * replaced with the neutral uniform-white dome so ambient light reads unbiased too.
 * sunLevel is pinned to COLOR_CHECK_SUN_LEVEL while the sun is above the horizon
 * and to 0 otherwise. sunDirection and cloudCover pass through untouched so
 * shadows still read.
 */
export function colorCheckLighting(lighting: EnvironmentLighting): EnvironmentLighting {
  return {
    ...lighting,
    sunColor: NEUTRAL_REFERENCE_WHITE,
    skyColor: NEUTRAL_REFERENCE_WHITE,
    skyAmbient: NEUTRAL_DOME_SPHERICAL_HARMONICS,
    sunLevel: lighting.sunDirection.y > 0 ? COLOR_CHECK_SUN_LEVEL : 0,
  }
}
