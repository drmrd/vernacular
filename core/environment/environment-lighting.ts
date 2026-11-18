import { clampToUnitInterval } from '../color/linear-rgb'
import type { LinearRgb } from '../color/oklab'
import type { LatLong } from '../model/site'
import type { Vector3 } from '../scene/vector3'
import { referenceLightingInput } from './daylight-reference'
import type { ObservationInstant } from './observation-time'
import { DEFAULT_CLOUD_COVER, skyLighting } from './sky-model'
import { type SolarAngles, type SolarPositionInput, solarPosition } from './solar-position'
import { projectDomeToSphericalHarmonics } from './spherical-harmonics'
import { sunWorldDirection } from './sun-world-direction'

const FALLBACK_NORTH_BEARING = 0

/** Everything the outdoor-lighting rig needs for one site, instant, and sky. */
export interface EnvironmentLighting {
  /** Unit world-space direction pointing from the scene toward the sun. */
  sunDirection: Vector3
  /** Direct sun tint in linear-light sRGB. */
  sunColor: LinearRgb
  /** Ambient/hemisphere sky tint in linear-light sRGB. */
  skyColor: LinearRgb
  /**
   * Direct-sun level, 0 (extinguished) to the full sun's level, fading along the light's path,
   * 0 at and below the horizon.
   */
  sunLevel: number
  /**
   * Cloud-cover fraction the sky was computed with, after the fallback and the clamp; the visible
   * sky mesh reads it.
   */
  cloudCover: number
  /** Nine RGB spherical-harmonic triples of the sky dome, SphericalHarmonics3 order. */
  skyAmbient: readonly number[]
}

/** The site, civil observation instant, and weather that drive the lighting. */
export interface EnvironmentLightingInput {
  /** Site location in decimal degrees. */
  latLong: LatLong
  /** Site north bearing in radians, plan-up to true north. A bearing that is not finite counts as 0. */
  northBearing: number
  /** Offset from UTC in minutes; local civil time = UTC + this offset. */
  utcOffsetMinutes: number
  /** The civil date and wall-clock minutes the scene is observed at. */
  observedAt: ObservationInstant
  /**
   * Cloud-cover fraction, 0 (clear) to 1 (fully overcast). `NaN` counts as `DEFAULT_CLOUD_COVER`; a
   * value outside 0..1 is clamped into it.
   */
  cloudCover: number
}

/**
 * Composes the full outdoor lighting state for one observation: `solarPosition`
 * resolves the sun's horizontal-frame angles for the site and civil instant,
 * `sunWorldDirection` rotates them through the site north bearing into the
 * y-up world frame (ADR-0139), and `skyLighting` derives the sun and sky tints
 * from the solar altitude and cloud cover. `sunLevel` passes straight through
 * from `skyLighting`, carrying the fade along the light's path, 0 at and below the horizon, so
 * the direct sun fades to nothing as it sets. `skyAmbient` projects the same analytic sky dome into
 * spherical-harmonic coefficients for the ambient probe, and `cloudCover` reports the
 * cloud cover the sky was computed with, so the visible sky mesh can read it.
 * Frame and unit conventions follow those piece functions.
 *
 * Input that cannot be used falls back, and the function never throws. When the solar angles for
 * the site and instant are not finite (a coordinate, offset or minute that is not finite or too
 * large for the formulas, or a date whose text gives no number), the sun is the daylight reference
 * sun: the place, the instant, and the UTC offset of `referenceLightingInput()`, still under the
 * input's north bearing and cloud cover. A north bearing that is not finite counts as 0. A cloud
 * cover of `NaN` counts as `DEFAULT_CLOUD_COVER`, any other cloud cover is clamped into 0..1, and
 * `cloudCover` in the result is the value used. Every number of the result is then finite.
 */
export function computeEnvironmentLighting(input: EnvironmentLightingInput): EnvironmentLighting {
  const angles = lightingSolarAngles(input)
  const cloudCover = lightingCloudCover(input)
  const { sunColor, skyColor, sunLevel } = skyLighting(angles.altitude, cloudCover)
  const sunDirection = sunWorldDirection(angles, lightingNorthBearing(input))
  return {
    sunDirection,
    sunColor,
    skyColor,
    sunLevel,
    cloudCover,
    skyAmbient: projectDomeToSphericalHarmonics({ sunDirection, cloudCover }),
  }
}

function lightingNorthBearing(input: EnvironmentLightingInput): number {
  return Number.isFinite(input.northBearing) ? input.northBearing : FALLBACK_NORTH_BEARING
}

function lightingCloudCover(input: EnvironmentLightingInput): number {
  return Number.isNaN(input.cloudCover)
    ? DEFAULT_CLOUD_COVER
    : clampToUnitInterval(input.cloudCover)
}

function lightingSolarAngles(input: EnvironmentLightingInput): SolarAngles {
  const angles = solarPosition(solarPositionOf(input))
  if (Number.isFinite(angles.azimuth) && Number.isFinite(angles.altitude)) return angles
  return solarPosition(solarPositionOf(referenceLightingInput()))
}

function solarPositionOf(input: EnvironmentLightingInput): SolarPositionInput {
  return {
    latitude: input.latLong.latitude,
    longitude: input.latLong.longitude,
    observedAt: input.observedAt,
    utcOffsetMinutes: input.utcOffsetMinutes,
  }
}
