import { describe, expect, it } from 'vitest'
import {
  evaluateSphericalHarmonics,
  NEUTRAL_DOME_SPHERICAL_HARMONICS,
  projectDomeToSphericalHarmonics,
  SH_COEFFICIENT_COUNT,
} from './spherical-harmonics'
import { skyDomeRadiance } from './sky-dome'
import { NEUTRAL_REFERENCE_WHITE } from './color-check'
import type { LinearRgb } from '../color/oklab'
import type { Vector3 } from '../scene/vector3'

// projectDomeToSphericalHarmonics turns the analytic sky dome (a function of view
// direction) into nine RGB spherical-harmonic coefficient triples; evaluateSphericalHarmonics
// reconstructs an approximate radiance back out of those coefficients in a given unit
// direction. Order-2 SH is a low-pass fit, so these tests pin down relational facts and a
// generous reconstruction bound rather than exact values, and avoid asserting the sign of
// any individual basis-convention coefficient.

const ZENITH_DIRECTION: Vector3 = { x: 0, y: 1, z: 0 }
const HORIZON_DIRECTION: Vector3 = { x: 1, y: 0, z: 0 }
const GROUND_DIRECTION: Vector3 = { x: 0, y: -1, z: 0 }
// A second horizon direction at a different azimuth, for the azimuthal-symmetry check.
const HORIZON_DIRECTION_OTHER_AZIMUTH: Vector3 = { x: 0, y: 0, z: 1 }

const HIGH_SUN_ALTITUDE = Math.PI / 2
const MODERATE_SUN_ALTITUDE = 0.7
const LOW_SUN_ALTITUDE = 0.3
const CLEAR_SKY = 0

const ZENITH_VIEW_ELEVATION = Math.PI / 2
const MID_VIEW_ELEVATION = Math.PI / 4
const HORIZON_VIEW_ELEVATION = 0

// A representative sample of (sun altitude, view elevation) pairs to check the SH
// reconstruction against the dome it was projected from.
const RECONSTRUCTION_SAMPLES: ReadonlyArray<{ sunAltitude: number; viewElevation: number }> = [
  { sunAltitude: HIGH_SUN_ALTITUDE, viewElevation: ZENITH_VIEW_ELEVATION },
  { sunAltitude: HIGH_SUN_ALTITUDE, viewElevation: MID_VIEW_ELEVATION },
  { sunAltitude: HIGH_SUN_ALTITUDE, viewElevation: HORIZON_VIEW_ELEVATION },
  { sunAltitude: MODERATE_SUN_ALTITUDE, viewElevation: ZENITH_VIEW_ELEVATION },
  { sunAltitude: MODERATE_SUN_ALTITUDE, viewElevation: HORIZON_VIEW_ELEVATION },
  { sunAltitude: LOW_SUN_ALTITUDE, viewElevation: HORIZON_VIEW_ELEVATION },
]

// Order-2 spherical harmonics is a nine-term low-pass fit; it cannot reproduce the dome's
// horizon step exactly. This bounds the reconstruction's relative error against the dome's
// own summed-channel intensity at that direction, generous enough to tolerate that blur.
const RECONSTRUCTION_RELATIVE_TOLERANCE = 0.5

// Directions used to sample the neutral (band-0-only) dome's reconstruction; deliberately
// includes off-axis and non-unit-length-looking-but-normalized directions so uniformity
// cannot pass by only exercising the axes.
const NEUTRAL_DOME_SAMPLE_DIRECTIONS: readonly Vector3[] = [
  ZENITH_DIRECTION,
  HORIZON_DIRECTION,
  GROUND_DIRECTION,
  HORIZON_DIRECTION_OTHER_AZIMUTH,
  { x: Math.SQRT1_2, y: Math.SQRT1_2, z: 0 },
]

// The neutral dome carries no direction-dependent structure at all, so reconstruction can
// be checked to a very tight tolerance.
const NEUTRAL_DOME_TOLERANCE = 1e-6

function directionAtElevation(viewElevation: number): Vector3 {
  return { x: Math.cos(viewElevation), y: Math.sin(viewElevation), z: 0 }
}

function summedIntensity(color: LinearRgb): number {
  return color.r + color.g + color.b
}

describe('projectDomeToSphericalHarmonics', () => {
  it('returns a flattened nine-band RGB coefficient array', () => {
    const coefficients = projectDomeToSphericalHarmonics(HIGH_SUN_ALTITUDE, CLEAR_SKY)
    expect(coefficients).toHaveLength(SH_COEFFICIENT_COUNT)
  })

  it('reconstructs a clear high-sun dome brighter overhead than at the horizon, and brighter at the horizon than at the ground', () => {
    const coefficients = projectDomeToSphericalHarmonics(HIGH_SUN_ALTITUDE, CLEAR_SKY)
    const zenith = evaluateSphericalHarmonics(coefficients, ZENITH_DIRECTION)
    const horizon = evaluateSphericalHarmonics(coefficients, HORIZON_DIRECTION)
    const ground = evaluateSphericalHarmonics(coefficients, GROUND_DIRECTION)

    expect(summedIntensity(zenith)).toBeGreaterThan(summedIntensity(horizon))
    expect(summedIntensity(horizon)).toBeGreaterThan(summedIntensity(ground))
  })

  it('reconstructs the same radiance at every azimuth for the azimuthally symmetric dome', () => {
    const coefficients = projectDomeToSphericalHarmonics(HIGH_SUN_ALTITUDE, CLEAR_SKY)
    const horizon = evaluateSphericalHarmonics(coefficients, HORIZON_DIRECTION)
    const horizonOtherAzimuth = evaluateSphericalHarmonics(
      coefficients,
      HORIZON_DIRECTION_OTHER_AZIMUTH,
    )

    expect(horizonOtherAzimuth.r).toBeCloseTo(horizon.r, 3)
    expect(horizonOtherAzimuth.g).toBeCloseTo(horizon.g, 3)
    expect(horizonOtherAzimuth.b).toBeCloseTo(horizon.b, 3)
  })

  it('reconstructs the dome within a generous tolerance of its own radiance at each sampled direction', () => {
    for (const { sunAltitude, viewElevation } of RECONSTRUCTION_SAMPLES) {
      const coefficients = projectDomeToSphericalHarmonics(sunAltitude, CLEAR_SKY)
      const expected = skyDomeRadiance(viewElevation, sunAltitude, CLEAR_SKY)
      const actual = evaluateSphericalHarmonics(coefficients, directionAtElevation(viewElevation))

      const expectedIntensity = summedIntensity(expected)
      const relativeError =
        Math.abs(summedIntensity(actual) - expectedIntensity) / expectedIntensity

      expect(relativeError).toBeLessThan(RECONSTRUCTION_RELATIVE_TOLERANCE)
    }
  })
})

describe('NEUTRAL_DOME_SPHERICAL_HARMONICS', () => {
  it('reconstructs the neutral reference white in every direction', () => {
    for (const direction of NEUTRAL_DOME_SAMPLE_DIRECTIONS) {
      const reconstructed = evaluateSphericalHarmonics(NEUTRAL_DOME_SPHERICAL_HARMONICS, direction)

      expect(reconstructed.r).toBeCloseTo(NEUTRAL_REFERENCE_WHITE.r, 6)
      expect(reconstructed.g).toBeCloseTo(NEUTRAL_REFERENCE_WHITE.g, 6)
      expect(reconstructed.b).toBeCloseTo(NEUTRAL_REFERENCE_WHITE.b, 6)
    }
  })

  it('reconstructs equal channels at every sampled direction', () => {
    for (const direction of NEUTRAL_DOME_SAMPLE_DIRECTIONS) {
      const reconstructed = evaluateSphericalHarmonics(NEUTRAL_DOME_SPHERICAL_HARMONICS, direction)

      expect(Math.abs(reconstructed.r - reconstructed.g)).toBeLessThan(NEUTRAL_DOME_TOLERANCE)
      expect(Math.abs(reconstructed.g - reconstructed.b)).toBeLessThan(NEUTRAL_DOME_TOLERANCE)
    }
  })
})
