import type { LinearRgb } from '../color/oklab'
import type { LatLong } from '../model/site'
import type { Vector3 } from '../scene/vector3'
import { referenceLightingInput } from './daylight-reference'
import type { ObservationInstant } from './observation-time'
import { skyLighting } from './sky-model'
import { type SolarAngles, type SolarPositionInput, solarPosition } from './solar-position'
import { projectDomeToSphericalHarmonics } from './spherical-harmonics'
import { sunWorldDirection } from './sun-world-direction'

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
  /** Cloud-cover fraction the sky was computed with; the visible sky mesh reads it. */
  cloudCover: number
  /** Nine RGB spherical-harmonic triples of the sky dome, SphericalHarmonics3 order. */
  skyAmbient: readonly number[]
}

/** The site, civil observation instant, and weather that drive the lighting. */
export interface EnvironmentLightingInput {
  /** Site location in decimal degrees. */
  latLong: LatLong
  /** Site north bearing in radians, plan-up to true north. */
  northBearing: number
  /** Offset from UTC in minutes; local civil time = UTC + this offset. */
  utcOffsetMinutes: number
  /** The civil date and wall-clock minutes the scene is observed at. */
  observedAt: ObservationInstant
  /** Cloud-cover fraction, 0 (clear) to 1 (fully overcast). */
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
 * spherical-harmonic coefficients for the ambient probe, and `cloudCover` passes
 * straight through so the visible sky mesh can read the value it was computed with.
 * Frame and unit conventions follow those piece functions.
 *
 * Input that cannot be used falls back, and the function never throws. When the solar angles for
 * the site and instant are not finite (a coordinate, offset or minute that is not finite or too
 * large for the formulas, or a date that does not parse), the sun is the daylight reference sun:
 * the place, the instant, and the UTC offset of `referenceLightingInput()`, still under the input's
 * north bearing and cloud cover.
 */
export function computeEnvironmentLighting(input: EnvironmentLightingInput): EnvironmentLighting {
  const angles = solarAnglesOrReference(input)
  const { sunColor, skyColor, sunLevel } = skyLighting(angles.altitude, input.cloudCover)
  const sunDirection = sunWorldDirection(angles, input.northBearing)
  return {
    sunDirection,
    sunColor,
    skyColor,
    sunLevel,
    cloudCover: input.cloudCover,
    skyAmbient: projectDomeToSphericalHarmonics({ sunDirection, cloudCover: input.cloudCover }),
  }
}

function solarAnglesOrReference(input: EnvironmentLightingInput): SolarAngles {
  const angles = solarPosition(solarPositionInput(input))
  if (Number.isFinite(angles.azimuth) && Number.isFinite(angles.altitude)) return angles
  return solarPosition(solarPositionInput(referenceLightingInput()))
}

function solarPositionInput(input: EnvironmentLightingInput): SolarPositionInput {
  return {
    latitude: input.latLong.latitude,
    longitude: input.latLong.longitude,
    observedAt: input.observedAt,
    utcOffsetMinutes: input.utcOffsetMinutes,
  }
}
