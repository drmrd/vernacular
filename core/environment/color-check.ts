import type { LinearRgb } from '../color/oklab'
import type { EnvironmentLighting } from './environment-lighting'
import { NEUTRAL_DOME_SPHERICAL_HARMONICS } from './spherical-harmonics'

/** The white-balanced reference tint the color check renders under (linear-light sRGB). */
export const NEUTRAL_REFERENCE_WHITE: LinearRgb = { r: 1, g: 1, b: 1 }

/**
 * Neutralizes the sun and sky tints to the white-balanced reference; sun direction
 * and sun intensity pass through untouched so shadows and the day/night fade still read.
 */
export function colorCheckLighting(lighting: EnvironmentLighting): EnvironmentLighting {
  return {
    ...lighting,
    sunColor: NEUTRAL_REFERENCE_WHITE,
    skyColor: NEUTRAL_REFERENCE_WHITE,
    skyAmbient: NEUTRAL_DOME_SPHERICAL_HARMONICS,
  }
}
