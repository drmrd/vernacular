import { describe, expect, it } from 'vitest'
import { referenceLightingInput } from './daylight-reference'
import {
  computeEnvironmentLighting,
  type EnvironmentLighting,
  type EnvironmentLightingInput,
} from './environment-lighting'
import { skyLighting } from './sky-model'
import { solarPosition } from './solar-position'
import { projectDomeToSphericalHarmonics } from './spherical-harmonics'
import { sunWorldDirection } from './sun-world-direction'

const NOON_MINUTES = 720

// The equinox-noon input of the lighting composition tests.
const BASE_INPUT: EnvironmentLightingInput = {
  latLong: { latitude: 40, longitude: -75 },
  northBearing: 0.4,
  utcOffsetMinutes: -300,
  observedAt: { date: '2026-03-20', minutesSinceMidnight: NOON_MINUTES },
  cloudCover: 0.25,
}

function numbersOf(lighting: EnvironmentLighting): number[] {
  const { sunDirection, sunColor, skyColor } = lighting
  return [
    sunDirection.x,
    sunDirection.y,
    sunDirection.z,
    lighting.sunLevel,
    sunColor.r,
    sunColor.g,
    sunColor.b,
    skyColor.r,
    skyColor.g,
    skyColor.b,
    lighting.cloudCover,
    ...lighting.skyAmbient,
  ]
}

function composedFromPieces(input: EnvironmentLightingInput): EnvironmentLighting {
  const angles = solarPosition({
    latitude: input.latLong.latitude,
    longitude: input.latLong.longitude,
    observedAt: input.observedAt,
    utcOffsetMinutes: input.utcOffsetMinutes,
  })
  const sunDirection = sunWorldDirection(angles, input.northBearing)
  return {
    sunDirection,
    ...skyLighting(angles.altitude, input.cloudCover),
    cloudCover: input.cloudCover,
    skyAmbient: projectDomeToSphericalHarmonics({ sunDirection, cloudCover: input.cloudCover }),
  }
}

function withLatLong(latitude: number, longitude: number): EnvironmentLightingInput {
  return { ...BASE_INPUT, latLong: { latitude, longitude } }
}

function withObservedAt(date: string, minutesSinceMidnight: number): EnvironmentLightingInput {
  return { ...BASE_INPUT, observedAt: { date, minutesSinceMidnight } }
}

function withNorthBearing(northBearing: number): EnvironmentLightingInput {
  return { ...BASE_INPUT, northBearing }
}

const REFERENCE_SUN_UNDER_BASE_WEATHER = computeEnvironmentLighting({
  ...referenceLightingInput(),
  northBearing: BASE_INPUT.northBearing,
  cloudCover: BASE_INPUT.cloudCover,
})

describe('computeEnvironmentLighting with input that cannot be used', () => {
  describe('solar angles that are not finite', () => {
    it.each([
      ['a latitude that is not a number', withLatLong(NaN, -75)],
      ['an infinite latitude', withLatLong(Infinity, -75)],
      ['a negative infinite longitude', withLatLong(40, -Infinity)],
      ['a latitude too large for the formulas', withLatLong(1e308, -75)],
      ['a UTC offset that is not a number', { ...BASE_INPUT, utcOffsetMinutes: NaN }],
      ['a minute that is not a number', withObservedAt('2026-03-20', NaN)],
      ['an infinite minute', withObservedAt('2026-03-20', Infinity)],
      ['a date that does not parse', withObservedAt('not a date', NOON_MINUTES)],
    ])('uses the reference sun under the same bearing and cloud cover for %s', (_title, input) => {
      const lighting = computeEnvironmentLighting(input)
      expect(lighting).toStrictEqual(REFERENCE_SUN_UNDER_BASE_WEATHER)
      expect(numbersOf(lighting).every(Number.isFinite)).toBe(true)
    })
  })

  describe('a north bearing that is not finite', () => {
    it.each([
      ['a bearing that is not a number', NaN],
      ['an infinite bearing', Infinity],
      ['a negative infinite bearing', -Infinity],
    ])('counts as a bearing of zero for %s', (_title, northBearing) => {
      const lighting = computeEnvironmentLighting(withNorthBearing(northBearing))
      expect(lighting).toStrictEqual(computeEnvironmentLighting(withNorthBearing(0)))
      expect(numbersOf(lighting).every(Number.isFinite)).toBe(true)
    })

    it('keeps a finite bearing however large', () => {
      const input = withNorthBearing(1e308)
      expect(computeEnvironmentLighting(input)).toStrictEqual(composedFromPieces(input))
    })
  })

  describe('valid input', () => {
    it.each([
      ['the equinox noon input', BASE_INPUT],
      ['the daylight reference input', referenceLightingInput()],
      ['a sun below the horizon', withObservedAt('2026-03-20', 0)],
      [
        'a polar night under full cloud',
        {
          latLong: { latitude: 78.2, longitude: 15.6 },
          northBearing: -1.2,
          utcOffsetMinutes: 60,
          observedAt: { date: '2026-12-21', minutesSinceMidnight: NOON_MINUTES },
          cloudCover: 1,
        },
      ],
      ['a clear sky', { ...BASE_INPUT, cloudCover: 0 }],
    ])('keeps the composition of the piece functions exactly for %s', (_title, input) => {
      expect(computeEnvironmentLighting(input)).toStrictEqual(composedFromPieces(input))
    })
  })
})
