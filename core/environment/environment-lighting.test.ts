import { describe, expect, it } from 'vitest'
import { computeEnvironmentLighting, type EnvironmentLightingInput } from './environment-lighting'
import { solarPosition, type SolarAngles } from './solar-position'
import { sunWorldDirection } from './sun-world-direction'
import { skyLighting } from './sky-model'
import { evaluateSphericalHarmonics, SH_COEFFICIENT_COUNT } from './spherical-harmonics'
import type { LinearRgb } from '../color/oklab'
import type { Vector3 } from '../scene/vector3'

// computeEnvironmentLighting is a pure composition of the three piece
// functions on this branch: solarPosition turns site and instant into solar
// angles, sunWorldDirection maps those angles into the y-up world frame, and
// skyLighting tints the sun and sky for the altitude and cloud cover. These
// tests pin the composition to the pieces themselves rather than to fresh
// reference numbers, so the piece tests stay the single source of truth for
// the underlying math.

const COMPOSITION_DECIMAL_PLACES = 10

const LOCAL_NOON_MINUTES = 720
const LOCAL_MIDNIGHT_MINUTES = 0

// The sky-ambient reconstruction is checked straight overhead, where a setting
// sun's dimming is least ambiguous.
const ZENITH_DIRECTION: Vector3 = { x: 0, y: 1, z: 0 }

function equinoxNoonInput(): EnvironmentLightingInput {
  return {
    latLong: { latitude: 40.0, longitude: -75.0 },
    northBearing: 0.4,
    utcOffsetMinutes: -300,
    observedAt: { date: '2026-03-20', minutesSinceMidnight: LOCAL_NOON_MINUTES },
    cloudCover: 0.25,
  }
}

function pieceFunctionAngles(input: EnvironmentLightingInput): SolarAngles {
  return solarPosition({
    latitude: input.latLong.latitude,
    longitude: input.latLong.longitude,
    observedAt: input.observedAt,
    utcOffsetMinutes: input.utcOffsetMinutes,
  })
}

function deepFreeze(input: EnvironmentLightingInput): EnvironmentLightingInput {
  Object.freeze(input.latLong)
  Object.freeze(input.observedAt)
  return Object.freeze(input)
}

function summedIntensity(color: LinearRgb): number {
  return color.r + color.g + color.b
}

describe('computeEnvironmentLighting', () => {
  it('aims the sun where the solar-position and world-direction pieces agree', () => {
    const input = equinoxNoonInput()
    const expected = sunWorldDirection(pieceFunctionAngles(input), input.northBearing)
    const { sunDirection } = computeEnvironmentLighting(input)
    expect(sunDirection.x).toBeCloseTo(expected.x, COMPOSITION_DECIMAL_PLACES)
    expect(sunDirection.y).toBeCloseTo(expected.y, COMPOSITION_DECIMAL_PLACES)
    expect(sunDirection.z).toBeCloseTo(expected.z, COMPOSITION_DECIMAL_PLACES)
  })

  it('tints the sun and sky as the sky model does for the same altitude and cloud', () => {
    const input = equinoxNoonInput()
    const expected = skyLighting(pieceFunctionAngles(input).altitude, input.cloudCover)
    const { sunColor, skyColor } = computeEnvironmentLighting(input)
    expect(sunColor.r).toBeCloseTo(expected.sunColor.r, COMPOSITION_DECIMAL_PLACES)
    expect(sunColor.g).toBeCloseTo(expected.sunColor.g, COMPOSITION_DECIMAL_PLACES)
    expect(sunColor.b).toBeCloseTo(expected.sunColor.b, COMPOSITION_DECIMAL_PLACES)
    expect(skyColor.r).toBeCloseTo(expected.skyColor.r, COMPOSITION_DECIMAL_PLACES)
    expect(skyColor.g).toBeCloseTo(expected.skyColor.g, COMPOSITION_DECIMAL_PLACES)
    expect(skyColor.b).toBeCloseTo(expected.skyColor.b, COMPOSITION_DECIMAL_PLACES)
  })

  it('reports a positive sunIntensity at local noon and none at local midnight', () => {
    const noon = computeEnvironmentLighting(equinoxNoonInput())
    const midnight = computeEnvironmentLighting({
      ...equinoxNoonInput(),
      observedAt: { date: '2026-03-20', minutesSinceMidnight: LOCAL_MIDNIGHT_MINUTES },
    })
    expect(noon.sunIntensity).toBeGreaterThan(0)
    expect(midnight.sunIntensity).toBe(0)
  })

  it('leaves a frozen input untouched', () => {
    const input = deepFreeze(equinoxNoonInput())
    expect(() => computeEnvironmentLighting(input)).not.toThrow()
  })

  it('carries the input cloud cover through to the computed lighting', () => {
    const input = equinoxNoonInput()
    const { cloudCover } = computeEnvironmentLighting(input)
    expect(cloudCover).toBe(input.cloudCover)
  })

  it('projects a full sky-ambient spherical harmonic that dims once the sun drops below the horizon', () => {
    const noon = computeEnvironmentLighting(equinoxNoonInput())
    const midnight = computeEnvironmentLighting({
      ...equinoxNoonInput(),
      observedAt: { date: '2026-03-20', minutesSinceMidnight: LOCAL_MIDNIGHT_MINUTES },
    })

    expect(noon.skyAmbient).toHaveLength(SH_COEFFICIENT_COUNT)

    const noonZenith = evaluateSphericalHarmonics(noon.skyAmbient, ZENITH_DIRECTION)
    const midnightZenith = evaluateSphericalHarmonics(midnight.skyAmbient, ZENITH_DIRECTION)
    expect(summedIntensity(midnightZenith)).toBeLessThan(summedIntensity(noonZenith))
  })
})
