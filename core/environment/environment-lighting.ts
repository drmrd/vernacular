import type { LinearRgb } from '../color/oklab'
import type { LatLong } from '../model/site'
import type { Vector3 } from '../scene/vector3'
import type { ObservationInstant } from './observation-time'
import { skyLighting } from './sky-model'
import { solarPosition } from './solar-position'
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
  /** Direct-sun intensity scale, 0 (extinguished) to 1 (full sun), carrying the horizon extinction ramp. */
  sunIntensity: number
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
 * from the solar altitude and cloud cover. `sunIntensity` passes straight through
 * from `skyLighting`, carrying the horizon extinction ramp so the direct sun fades
 * to nothing as it sets. `skyAmbient` projects the same analytic sky dome into
 * spherical-harmonic coefficients for the ambient probe, and `cloudCover` passes
 * straight through so the visible sky mesh can read the value it was computed with.
 * Frame and unit conventions follow those piece functions.
 */
export function computeEnvironmentLighting(input: EnvironmentLightingInput): EnvironmentLighting {
  const angles = solarPosition({
    latitude: input.latLong.latitude,
    longitude: input.latLong.longitude,
    observedAt: input.observedAt,
    utcOffsetMinutes: input.utcOffsetMinutes,
  })
  const { sunColor, skyColor, sunIntensity } = skyLighting(angles.altitude, input.cloudCover)
  return {
    sunDirection: sunWorldDirection(angles, input.northBearing),
    sunColor,
    skyColor,
    sunIntensity,
    cloudCover: input.cloudCover,
    skyAmbient: projectDomeToSphericalHarmonics(angles.altitude, input.cloudCover),
  }
}
