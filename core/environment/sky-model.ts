import { clampToUnitInterval, greyOf, mixLinearRgb, scaleLinearRgb } from '../color/linear-rgb'
import type { LinearRgb } from '../color/oklab'
import { sunColorAt, sunLevelAt } from './daylight-calibration'

/**
 * The light an outdoor scene needs: the direct sun tint and the ambient sky tint,
 * both colors in linear-light sRGB, plus the sun's level. The sun warms
 * toward the horizon in `sunColor` while `sunLevel` carries the horizon dimming
 * and the below-horizon extinction; the sky stays cooler (bluer) than the sun.
 */
export interface SkyLighting {
  /** Direct sun tint at luminance 1, warmer near the horizon; the dimming lives in sunLevel, not here. */
  sunColor: LinearRgb
  /** Direct-sun level, 0 (extinguished below the horizon) to the calibrated sun scale (full sun overhead). */
  sunLevel: number
  /** Hemisphere fill tint, cooler than the sun; only the zeroed fill reads it. */
  skyColor: LinearRgb
}

/**
 * The cloud-cover fraction the solar path assumes when no weather is specified: a
 * clear sky. This is the absent-weather default, not a placeholder awaiting a future
 * weather layer; `EnvironmentState.cloudCover` and saved environment scenes carry the
 * real, user-set value.
 */
export const DEFAULT_CLOUD_COVER = 0

/** Hemisphere fill tint with the sun on the horizon: a dim, nearly grey dusk sky. */
const HORIZON_SKY_TINT: LinearRgb = { r: 0.45, g: 0.45, b: 0.5 }
/** Hemisphere fill tint with the sun overhead: a saturated daytime blue. */
const ZENITH_SKY_TINT: LinearRgb = { r: 0.35, g: 0.55, b: 1 }
/** Fraction of the fill's light a fully overcast sky removes, alongside flattening it toward grey. */
const OVERCAST_DIMMING = 0.3

/** Clouds scatter the fill toward grey and absorb some of it outright. */
function overcastAdjusted(color: LinearRgb, cloudCover: number): LinearRgb {
  const flattened = mixLinearRgb(color, greyOf(color), cloudCover)
  return scaleLinearRgb(flattened, 1 - OVERCAST_DIMMING * cloudCover)
}

/**
 * Analytic clear-sky lighting model. `altitude` is the sun's height above the
 * horizon in radians (negative once it has set); `cloudCover` is a 0..1
 * fraction (0 clear, 1 fully overcast). The sun's color and level come from the
 * daylight calibration: the color is white-balanced at luminance 1, and the level
 * carries the dimming toward the horizon, the extinction just below, and the
 * cloud transmission. The sky color is the tint of the hemisphere fill, which
 * daylight does not read: it blends between named horizon and zenith tints on the
 * sun's elevation and flattens toward grey under cloud while dimming.
 */
export function skyLighting(altitude: number, cloudCover: number): SkyLighting {
  const elevation = clampToUnitInterval(Math.sin(altitude))
  const clearSky = mixLinearRgb(HORIZON_SKY_TINT, ZENITH_SKY_TINT, elevation)
  return {
    sunColor: sunColorAt(altitude, cloudCover),
    sunLevel: sunLevelAt(altitude, cloudCover),
    skyColor: overcastAdjusted(clearSky, cloudCover),
  }
}
