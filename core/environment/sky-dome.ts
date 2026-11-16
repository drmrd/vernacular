import type { LinearRgb } from '../color/oklab'
import type { Vector3 } from '../scene/vector3'
import { SUNWARD_GAIN, levelCardLight, upperDomeTints } from './daylight-calibration'
import { GROUND_SURFACE_COLOR } from './ground-surface'

/** The sky the dome is drawn for: a unit world-frame direction toward the sun, and the cloud cover. */
export type SkyDomeInput = { sunDirection: Vector3; cloudCover: number }

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

/** The sun's height above the horizon in radians, from its unit direction. */
function sunAltitudeOf(sky: SkyDomeInput): number {
  return Math.asin(Math.min(1, Math.max(-1, sky.sunDirection.y)))
}

/**
 * The lawn under the light a level card receives: the direct sun's irradiance over pi plus the
 * cosine-weighted mean of the upper dome, both from the daylight calibration.
 */
function groundRadiance(sunAltitude: number, cloudCover: number): LinearRgb {
  const { sun, sky } = levelCardLight(sunAltitude, cloudCover)
  return {
    r: GROUND_SURFACE_COLOR.r * (sun.r + sky.r),
    g: GROUND_SURFACE_COLOR.g * (sun.g + sky.g),
    b: GROUND_SURFACE_COLOR.b * (sun.b + sky.b),
  }
}

/**
 * Builds the dome's radiance function for one sky. Everything that depends only on the sky (the
 * sun's altitude, the dome's end tints, the lawn's radiance) is computed here once, so a caller
 * sampling many directions pays only the per-direction work for each.
 * Above the horizon (y at or above 0) the dome blends the calibrated horizon tint into the zenith
 * tint on the view height and brightens toward the sun's azimuth under a clear sky. Below the
 * horizon it is the lawn lit by the sun and the upper dome.
 */
export function skyDomeSampler(sky: SkyDomeInput): (view: Vector3) => LinearRgb {
  const { sunDirection, cloudCover } = sky
  const sunAltitude = sunAltitudeOf(sky)
  const dome = upperDomeTints(sunAltitude, cloudCover)
  const ground = groundRadiance(sunAltitude, cloudCover)
  const sunwardGain = SUNWARD_GAIN * (1 - cloudCover)
  return (view) => {
    if (view.y < 0) return ground
    const sunwardAlignment = view.x * sunDirection.x + view.z * sunDirection.z
    const brightening = 1 + sunwardGain * sunwardAlignment
    const radiance = mixLinearRgb(dome.horizon, dome.zenith, clampToUnitInterval(view.y))
    return scaleLinearRgb(radiance, brightening)
  }
}

/** Radiance of the analytic sky dome in a unit view direction (y up), as linear-light sRGB. */
export function skyDomeRadiance(view: Vector3, sky: SkyDomeInput): LinearRgb {
  return skyDomeSampler(sky)(view)
}
