import type { LinearRgb } from '../color/oklab'
import type { Vector3 } from '../scene/vector3'
import { NEUTRAL_REFERENCE_WHITE } from './color-check'
import { skyDomeRadiance } from './sky-dome'

/*
 * Real spherical-harmonic basis constants up to band 2, transcribed EXACTLY from
 * three r184's SphericalHarmonics3.getBasisAt
 * (node_modules/three/src/math/SphericalHarmonics3.js). three consumes the world
 * (x, y, z) directly and treats z as the zonal axis, so evaluateSphericalHarmonics
 * reproduces what THREE.LightProbe.getAt computes from the same flattened array.
 * core must not import three, so the numbers live here as named constants.
 */
const SH_BAND_0 = 0.282095
const SH_BAND_1 = 0.488603
const SH_BAND_2_MIXED = 1.092548
const SH_BAND_2_ZONAL = 0.315392
const SH_BAND_2_SECTORAL = 0.546274
/** The z-squared multiplier inside three's band-2 zonal basis function (3z^2 - 1). */
const ZONAL_Z_SQUARED_MULTIPLIER = 3

/** RGB channels carried per spherical-harmonic coefficient. */
const RGB_CHANNEL_COUNT = 3

type SphericalHarmonicBasis = (direction: Vector3) => number

/**
 * The nine band-0..2 basis functions in three's SphericalHarmonics3 order:
 * Y(0,0); Y(1,-1), Y(1,0), Y(1,1); Y(2,-2), Y(2,-1), Y(2,0), Y(2,1), Y(2,2).
 */
const SPHERICAL_HARMONIC_BASIS: readonly SphericalHarmonicBasis[] = [
  () => SH_BAND_0,
  ({ y }) => SH_BAND_1 * y,
  ({ z }) => SH_BAND_1 * z,
  ({ x }) => SH_BAND_1 * x,
  ({ x, y }) => SH_BAND_2_MIXED * x * y,
  ({ y, z }) => SH_BAND_2_MIXED * y * z,
  ({ z }) => SH_BAND_2_ZONAL * (ZONAL_Z_SQUARED_MULTIPLIER * z * z - 1),
  ({ x, z }) => SH_BAND_2_MIXED * x * z,
  ({ x, y }) => SH_BAND_2_SECTORAL * (x * x - y * y),
]

/** Nine RGB triples, flattened; the order matches three's SphericalHarmonics3.fromArray. */
export const SH_COEFFICIENT_COUNT = SPHERICAL_HARMONIC_BASIS.length * RGB_CHANNEL_COUNT

/** Polar (latitude) samples across the dome; deterministic, midpoint-sampled. */
const POLAR_SAMPLE_COUNT = 64
/** Azimuth (longitude) samples around the dome. */
const AZIMUTH_SAMPLE_COUNT = 128
/** Places each sample at its cell's midpoint, away from the poles and the seam. */
const SAMPLE_MIDPOINT = 0.5
/** One full revolution in radians. */
const FULL_TURN_RAD = Math.PI * 2

function coefficientAt(coefficients: readonly number[], index: number): number {
  return coefficients[index] ?? 0
}

/** Evaluates a flattened 9-band-coefficient set in a unit direction (y up). */
export function evaluateSphericalHarmonics(
  coefficients: readonly number[],
  direction: Vector3,
): LinearRgb {
  return SPHERICAL_HARMONIC_BASIS.reduce<LinearRgb>(
    (total, basis, index) => {
      const weight = basis(direction)
      const base = index * RGB_CHANNEL_COUNT
      return {
        r: total.r + coefficientAt(coefficients, base) * weight,
        g: total.g + coefficientAt(coefficients, base + 1) * weight,
        b: total.b + coefficientAt(coefficients, base + 2) * weight,
      }
    },
    { r: 0, g: 0, b: 0 },
  )
}

interface BasisAccumulator {
  basis: SphericalHarmonicBasis
  color: LinearRgb
}

/** A polar ring's shared radiance and per-direction solid angle, reused across its azimuth sweep. */
interface SkyRingSample {
  radiance: LinearRgb
  solidAngle: number
}

function directionFromAngles(polar: number, azimuth: number): Vector3 {
  const horizontalRadius = Math.sin(polar)
  return {
    x: horizontalRadius * Math.cos(azimuth),
    y: Math.cos(polar),
    z: horizontalRadius * Math.sin(azimuth),
  }
}

/** Accumulates one sky-dome direction's contribution directly into each basis's running RGB sum. */
function accumulateDirection(
  accumulators: readonly BasisAccumulator[],
  direction: Vector3,
  ring: SkyRingSample,
): void {
  for (const accumulator of accumulators) {
    const weight = accumulator.basis(direction) * ring.solidAngle
    accumulator.color.r += ring.radiance.r * weight
    accumulator.color.g += ring.radiance.g * weight
    accumulator.color.b += ring.radiance.b * weight
  }
}

/**
 * Projects the analytic sky dome into nine spherical-harmonic RGB coefficients by
 * numeric integration over a fixed deterministic direction grid. Pure and cheap
 * enough to run on every scrub tick, so no regeneration throttle is needed. Accumulates
 * directly per direction in a single pass rather than materializing an intermediate
 * sample array.
 */
export function projectDomeToSphericalHarmonics(sunAltitude: number, cloudCover: number): number[] {
  const deltaPolar = Math.PI / POLAR_SAMPLE_COUNT
  const deltaAzimuth = FULL_TURN_RAD / AZIMUTH_SAMPLE_COUNT
  const accumulators: BasisAccumulator[] = SPHERICAL_HARMONIC_BASIS.map((basis) => ({
    basis,
    color: { r: 0, g: 0, b: 0 },
  }))
  for (let polarIndex = 0; polarIndex < POLAR_SAMPLE_COUNT; polarIndex += 1) {
    const polar = (polarIndex + SAMPLE_MIDPOINT) * deltaPolar
    const ring: SkyRingSample = {
      radiance: skyDomeRadiance(Math.asin(Math.cos(polar)), sunAltitude, cloudCover),
      solidAngle: Math.sin(polar) * deltaPolar * deltaAzimuth,
    }
    for (let azimuthIndex = 0; azimuthIndex < AZIMUTH_SAMPLE_COUNT; azimuthIndex += 1) {
      const azimuth = (azimuthIndex + SAMPLE_MIDPOINT) * deltaAzimuth
      accumulateDirection(accumulators, directionFromAngles(polar, azimuth), ring)
    }
  }
  return accumulators.flatMap(({ color }) => [color.r, color.g, color.b])
}

/**
 * The band-0 coefficient of a uniform dome, chosen so evaluateSphericalHarmonics
 * reconstructs the given channel exactly. A uniform field is pure band 0, whose
 * basis is the constant SH_BAND_0, so dividing the channel through it inverts the
 * reconstruction (channel / SH_BAND_0 * SH_BAND_0 = channel). Deriving it in closed
 * form keeps the reference exact rather than leaning on the numeric grid.
 */
function uniformDomeBand0(channel: number): number {
  return channel / SH_BAND_0
}

/** Coefficients above band 0 that a uniform dome leaves at zero. */
const HIGHER_BAND_COEFFICIENTS = new Array<number>(SH_COEFFICIENT_COUNT - RGB_CHANNEL_COUNT).fill(0)

/** The color-check reference: a uniform NEUTRAL_REFERENCE_WHITE dome, band 0 only. */
export const NEUTRAL_DOME_SPHERICAL_HARMONICS: readonly number[] = [
  uniformDomeBand0(NEUTRAL_REFERENCE_WHITE.r),
  uniformDomeBand0(NEUTRAL_REFERENCE_WHITE.g),
  uniformDomeBand0(NEUTRAL_REFERENCE_WHITE.b),
  ...HIGHER_BAND_COEFFICIENTS,
]
