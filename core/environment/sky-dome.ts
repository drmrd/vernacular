import type { LinearRgb } from '../color/oklab'

/** Dome tint at the horizon: a dim, nearly grey band, matching the sky model's ambient. */
const HORIZON_DOME_TINT: LinearRgb = { r: 0.45, g: 0.45, b: 0.5 }
/** Dome tint at the zenith: a saturated daytime blue, bluer than the horizon band. */
const ZENITH_DOME_TINT: LinearRgb = { r: 0.25, g: 0.45, b: 0.9 }
/** Ground bounce for a below-horizon view: dim and desaturated, dimmer than the sky. */
const GROUND_DOME_TINT: LinearRgb = { r: 0.12, g: 0.1, b: 0.08 }
/** Fraction of full dome brightness that remains once the sun reaches the horizon. */
const HORIZON_DOME_SCALE = 0.35
/** Fraction of dome brightness a fully overcast sky removes, alongside flattening it toward grey. */
const OVERCAST_DOME_DIMMING = 0.3
// Mirrors sky-model.ts's private RGB-blend helpers; kept private on purpose so the two models can tune independently.
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

/** Clouds scatter dome light toward grey and absorb some of it outright. */
function overcastAdjustedDome(color: LinearRgb, cloudCover: number): LinearRgb {
  const flattened = mixLinearRgb(color, greyOf(color), cloudCover)
  return scaleLinearRgb(flattened, 1 - OVERCAST_DOME_DIMMING * cloudCover)
}

/**
 * Radiance of the analytic sky dome in a view direction, as linear-light sRGB.
 * `viewElevation` is the view direction's angle above the horizon in radians
 * (negative looks at the ground); `sunAltitude` and `cloudCover` mean what they
 * mean in skyLighting. Above the horizon the dome blends a horizon tint into a
 * zenith tint on sin(viewElevation); below it returns the ground bounce. The
 * whole dome dims as the sun sets and flattens toward grey under cloud, matching
 * the sky model's ambient behavior.
 */
export function skyDomeRadiance(
  viewElevation: number,
  sunAltitude: number,
  cloudCover: number,
): LinearRgb {
  const sunElevationFraction = clampToUnitInterval(Math.sin(sunAltitude))
  const domeScale = HORIZON_DOME_SCALE + (1 - HORIZON_DOME_SCALE) * sunElevationFraction
  const baseTint =
    viewElevation >= 0
      ? mixLinearRgb(
          HORIZON_DOME_TINT,
          ZENITH_DOME_TINT,
          clampToUnitInterval(Math.sin(viewElevation)),
        )
      : GROUND_DOME_TINT
  return overcastAdjustedDome(scaleLinearRgb(baseTint, domeScale), cloudCover)
}
