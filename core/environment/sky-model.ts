import type { LinearRgb } from '../color/oklab'

/**
 * The two light colors an outdoor scene needs: the direct sun tint and the
 * ambient sky tint, both in linear-light sRGB. The sun warms and dims toward
 * the horizon; the sky stays cooler (bluer) than the sun.
 */
export interface SkyLighting {
  /** Direct sun tint, warmer and dimmer near the horizon. */
  sunColor: LinearRgb
  /** Ambient/hemisphere sky tint, cooler than the sun. */
  skyColor: LinearRgb
}

/**
 * The cloud-cover fraction the solar path assumes until weather lands: a clear sky.
 * The slice-1b weather layer owns a real cloud-cover control.
 */
export const DEFAULT_CLOUD_COVER = 0

/** Direct sun tint with the sun on the horizon: strongly reddened by the long air path. */
const HORIZON_SUN_TINT: LinearRgb = { r: 1, g: 0.55, b: 0.25 }
/** Direct sun tint with the sun overhead: near-white with a faint residual warmth. */
const ZENITH_SUN_TINT: LinearRgb = { r: 1, g: 0.98, b: 0.95 }
/** Ambient sky tint with the sun on the horizon: a dim, nearly grey dusk sky. */
const HORIZON_SKY_TINT: LinearRgb = { r: 0.45, g: 0.45, b: 0.5 }
/** Ambient sky tint with the sun overhead: a saturated daytime blue. */
const ZENITH_SKY_TINT: LinearRgb = { r: 0.35, g: 0.55, b: 1 }
/** Fraction of full sun intensity that remains with the sun right on the horizon. */
const HORIZON_SUN_INTENSITY = 0.35
/** Radians below the horizon over which direct sunlight fades to nothing. */
const HORIZON_EXTINCTION_RADIANS = 0.1
/** Fraction of overall light a fully overcast sky removes. */
const OVERCAST_DIMMING = 0.3
const RGB_CHANNEL_COUNT = 3

function clampToUnitInterval(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function mixLinearRgb(from: LinearRgb, to: LinearRgb, fraction: number): LinearRgb {
  return {
    r: from.r + (to.r - from.r) * fraction,
    g: from.g + (to.g - from.g) * fraction,
    b: from.b + (to.b - from.b) * fraction,
  }
}

function scaleLinearRgb(color: LinearRgb, factor: number): LinearRgb {
  return { r: color.r * factor, g: color.g * factor, b: color.b * factor }
}

/** The grey a color flattens toward under cloud: its own channel mean. */
function greyOf(color: LinearRgb): LinearRgb {
  const mean = (color.r + color.g + color.b) / RGB_CHANNEL_COUNT
  return { r: mean, g: mean, b: mean }
}

/** Clouds scatter light toward grey and absorb some of it outright. */
function overcastAdjusted(color: LinearRgb, cloudCover: number): LinearRgb {
  const flattened = mixLinearRgb(color, greyOf(color), cloudCover)
  return scaleLinearRgb(flattened, 1 - OVERCAST_DIMMING * cloudCover)
}

/**
 * Analytic clear-sky lighting model. `altitude` is the sun's height above the
 * horizon in radians (negative once it has set); `cloudCover` is a 0..1
 * fraction (0 clear, 1 fully overcast). Both colors interpolate between named
 * horizon and zenith tints on the sun's elevation; the direct sun additionally
 * dims toward the horizon and extinguishes just below it, and cloud cover
 * flattens both colors toward grey while dimming them.
 */
export function skyLighting(altitude: number, cloudCover: number): SkyLighting {
  const elevation = clampToUnitInterval(Math.sin(altitude))
  const extinction = clampToUnitInterval(1 + altitude / HORIZON_EXTINCTION_RADIANS)
  const sunIntensity =
    extinction * (HORIZON_SUN_INTENSITY + (1 - HORIZON_SUN_INTENSITY) * elevation)
  const clearSun = scaleLinearRgb(
    mixLinearRgb(HORIZON_SUN_TINT, ZENITH_SUN_TINT, elevation),
    sunIntensity,
  )
  const clearSky = mixLinearRgb(HORIZON_SKY_TINT, ZENITH_SKY_TINT, elevation)
  return {
    sunColor: overcastAdjusted(clearSun, cloudCover),
    skyColor: overcastAdjusted(clearSky, cloudCover),
  }
}
