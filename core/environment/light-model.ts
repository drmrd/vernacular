import type { LinearRgb } from '../color/oklab'
import type { Vector3 } from '../scene/vector3'
import type { EnvironmentLighting } from './environment-lighting'

/*
 * The nine band-0..2 basis functions, restated from spherical-harmonics.ts (where
 * they are private) in the same order and with the same constants: coefficient
 * triple i holds the r, g, b of basis function i.
 */
const SH_BAND_0 = 0.282095
const SH_BAND_1 = 0.488603
const SH_BAND_2_MIXED = 1.092548
const SH_BAND_2_ZONAL = 0.315392
const SH_BAND_2_SECTORAL = 0.546274
/** The z-squared multiplier inside the band-2 zonal basis function (3z^2 - 1). */
const ZONAL_Z_SQUARED_MULTIPLIER = 3

/** Cosine-lobe convolution factors per band, over pi: pi, 2 pi / 3, and pi / 4, each divided by pi. */
const BAND_0_FACTOR = 1
const BAND_1_DENOMINATOR = 3
const BAND_2_DENOMINATOR = 4
const BAND_1_FACTOR = 2 / BAND_1_DENOMINATOR
const BAND_2_FACTOR = 1 / BAND_2_DENOMINATOR

/** The sun factor the engine applies today (DAYLIGHT_SUN_INTENSITY in engine/lighting/lighting-rig.ts).
 * The next change replaces `sunIntensity * ENGINE_SUN_FACTOR` with a sun level computed in core. */
const ENGINE_SUN_FACTOR = 1.6

/** RGB channels carried per spherical-harmonic coefficient. */
const RGB_CHANNEL_COUNT = 3

type Basis = { evaluate: (direction: Vector3) => number; factor: number }

const IRRADIANCE_BASES: readonly Basis[] = [
  { evaluate: () => SH_BAND_0, factor: BAND_0_FACTOR },
  { evaluate: ({ y }) => SH_BAND_1 * y, factor: BAND_1_FACTOR },
  { evaluate: ({ z }) => SH_BAND_1 * z, factor: BAND_1_FACTOR },
  { evaluate: ({ x }) => SH_BAND_1 * x, factor: BAND_1_FACTOR },
  { evaluate: ({ x, y }) => SH_BAND_2_MIXED * x * y, factor: BAND_2_FACTOR },
  { evaluate: ({ y, z }) => SH_BAND_2_MIXED * y * z, factor: BAND_2_FACTOR },
  {
    evaluate: ({ z }) => SH_BAND_2_ZONAL * (ZONAL_Z_SQUARED_MULTIPLIER * z * z - 1),
    factor: BAND_2_FACTOR,
  },
  { evaluate: ({ x, z }) => SH_BAND_2_MIXED * x * z, factor: BAND_2_FACTOR },
  { evaluate: ({ x, y }) => SH_BAND_2_SECTORAL * (x * x - y * y), factor: BAND_2_FACTOR },
]

function coefficientAt(coefficients: readonly number[], index: number): number {
  return coefficients[index] ?? 0
}

/** The irradiance over pi that the nine coefficients of each channel deliver to a surface. */
export function skyAmbientLevel(skyAmbient: readonly number[], normal: Vector3): LinearRgb {
  return IRRADIANCE_BASES.reduce<LinearRgb>(
    (total, basis, index) => {
      const weight = basis.evaluate(normal) * basis.factor
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
