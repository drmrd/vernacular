import type { LinearRgb } from '../color/oklab'
import type { Vector3 } from '../scene/vector3'
import type { EnvironmentLighting } from './environment-lighting'
import { SPHERICAL_HARMONIC_BASIS } from './spherical-harmonics'

/** Cosine-lobe convolution factors per band, over pi: pi, 2 pi / 3, and pi / 4, each divided by pi. */
const BAND_0_FACTOR = 1
const BAND_1_DENOMINATOR = 3
const BAND_2_DENOMINATOR = 4
const BAND_1_FACTOR = 2 / BAND_1_DENOMINATOR
const BAND_2_FACTOR = 1 / BAND_2_DENOMINATOR

/** The convolution factor of each basis function, in the order of SPHERICAL_HARMONIC_BASIS. */
const BAND_FACTORS: readonly number[] = [
  BAND_0_FACTOR,
  BAND_1_FACTOR,
  BAND_1_FACTOR,
  BAND_1_FACTOR,
  BAND_2_FACTOR,
  BAND_2_FACTOR,
  BAND_2_FACTOR,
  BAND_2_FACTOR,
  BAND_2_FACTOR,
]

/** The sun factor the engine applies today (DAYLIGHT_SUN_INTENSITY in engine/lighting/lighting-rig.ts).
 * The next change replaces `sunIntensity * ENGINE_SUN_FACTOR` with a sun level computed in core. */
const ENGINE_SUN_FACTOR = 1.6

/** RGB channels carried per spherical-harmonic coefficient. */
const RGB_CHANNEL_COUNT = 3

function coefficientAt(coefficients: readonly number[], index: number): number {
  return coefficients[index] ?? 0
}

/** The irradiance over pi that the nine coefficients of each channel deliver to a surface. */
export function skyAmbientLevel(skyAmbient: readonly number[], normal: Vector3): LinearRgb {
  return SPHERICAL_HARMONIC_BASIS.reduce<LinearRgb>(
    (total, basis, index) => {
      const weight = basis(normal) * (BAND_FACTORS[index] ?? 0)
      const base = index * RGB_CHANNEL_COUNT
      return {
        r: total.r + coefficientAt(skyAmbient, base) * weight,
        g: total.g + coefficientAt(skyAmbient, base + 1) * weight,
        b: total.b + coefficientAt(skyAmbient, base + 2) * weight,
      }
    },
    { r: 0, g: 0, b: 0 },
  )
}

export type MatteSurface = { normal: Vector3; reflectance: LinearRgb }

function sunTerm(lighting: EnvironmentLighting, normal: Vector3): number {
  const { sunDirection } = lighting
  const facing = Math.max(
    0,
    normal.x * sunDirection.x + normal.y * sunDirection.y + normal.z * sunDirection.z,
  )
  return (lighting.sunIntensity * ENGINE_SUN_FACTOR * facing) / Math.PI
}

/** What a matte surface returns, with no shadow and no specular term. */
export function predictedMatteRadiance(
  lighting: EnvironmentLighting,
  surface: MatteSurface,
): LinearRgb {
  const sun = sunTerm(lighting, surface.normal)
  const sky = skyAmbientLevel(lighting.skyAmbient, surface.normal)
  const { sunColor } = lighting
  const { reflectance } = surface
  return {
    r: reflectance.r * (sunColor.r * sun + sky.r),
    g: reflectance.g * (sunColor.g * sun + sky.g),
    b: reflectance.b * (sunColor.b * sun + sky.b),
  }
}
