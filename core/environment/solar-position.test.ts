import { describe, expect, it } from 'vitest'
import { solarPosition } from './solar-position'
import type { ObservationInstant } from './observation-time'

// Reference angles were computed with the astral 3.2 library, an implementation
// of the NOAA solar-position algorithm, and cross-checked analytically: the
// equinox local-noon altitude is 90 degrees minus latitude to within the
// declination drift. All angles are radians. Azimuth is measured clockwise from
// true north; altitude is GEOMETRIC (no atmospheric refraction) and negative
// below the horizon.

// toBeCloseTo(reference, 2) tolerates about 0.005 rad, roughly 0.3 degrees.
const ANGLE_DECIMAL_PLACES = 2

function observedAt(date: string, minutesSinceMidnight: number): ObservationInstant {
  return { date, minutesSinceMidnight }
}

describe('solarPosition', () => {
  it('puts the equinox local-noon sun due south of a northern mid-latitude site', () => {
    const { azimuth, altitude } = solarPosition({
      latitude: 40.0,
      longitude: -75.0,
      observedAt: observedAt('2026-03-20', 720),
      utcOffsetMinutes: -300,
    })
    expect(azimuth).toBeCloseTo(3.091539, ANGLE_DECIMAL_PLACES)
    expect(altitude).toBeCloseTo(0.872729, ANGLE_DECIMAL_PLACES)
  })

  it('places the summer-solstice morning sun in the east at moderate altitude', () => {
    const { azimuth, altitude } = solarPosition({
      latitude: 40.0,
      longitude: -75.0,
      observedAt: observedAt('2026-06-21', 540),
      utcOffsetMinutes: -240,
    })
    expect(azimuth).toBeCloseTo(1.553361, ANGLE_DECIMAL_PLACES)
    expect(altitude).toBeCloseTo(0.646269, ANGLE_DECIMAL_PLACES)
  })

  it('places the mid-winter afternoon sun northwest of a southern-hemisphere site', () => {
    const { azimuth, altitude } = solarPosition({
      latitude: -37.8,
      longitude: 145.0,
      observedAt: observedAt('2026-06-21', 900),
      utcOffsetMinutes: 600,
    })
    expect(azimuth).toBeCloseTo(5.619905, ANGLE_DECIMAL_PLACES)
    expect(altitude).toBeCloseTo(0.32059, ANGLE_DECIMAL_PLACES)
  })

  it('holds a low winter sun in the southwest late in the afternoon', () => {
    const { azimuth, altitude } = solarPosition({
      latitude: 40.0,
      longitude: -75.0,
      observedAt: observedAt('2026-12-21', 960),
      utcOffsetMinutes: -300,
    })
    expect(azimuth).toBeCloseTo(4.071158, ANGLE_DECIMAL_PLACES)
    expect(altitude).toBeCloseTo(0.091252, ANGLE_DECIMAL_PLACES)
  })

  it('climbs toward local noon: the equinox noon sun sits higher than two hours earlier', () => {
    const site = { latitude: 40.0, longitude: -75.0, utcOffsetMinutes: -300 }
    const atNoon = solarPosition({ ...site, observedAt: observedAt('2026-03-20', 720) })
    const twoHoursEarlier = solarPosition({ ...site, observedAt: observedAt('2026-03-20', 600) })
    expect(atNoon.altitude).toBeGreaterThan(twoHoursEarlier.altitude)
  })
})
