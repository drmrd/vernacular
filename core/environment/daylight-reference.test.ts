import { describe, expect, it } from 'vitest'
import {
  DAYLIGHT_REFERENCE_INSTANT,
  DAYLIGHT_REFERENCE_PLACE,
  referenceLightingInput,
} from './daylight-reference'
import { solarPosition } from './solar-position'

// The reference place and instant are the fixed observation that the daylight calibration is
// anchored to: the March equinox, mid-morning, at a site the sun stands about 45 degrees over.
// The exact height comes from solarPosition, never from a rounded 45.

const REFERENCE_SUN_HEIGHT_DEGREES = 44.9877
const REFERENCE_SUN_HEIGHT_TOLERANCE_DEGREES = 1e-4
const DEGREES_PER_RADIAN = 180 / Math.PI

describe('the daylight reference', () => {
  it('sits at latitude 40 and longitude 1.86 on 2026-03-20 at 630 minutes after midnight', () => {
    expect(DAYLIGHT_REFERENCE_PLACE).toEqual({ latitude: 40, longitude: 1.86 })
    expect(DAYLIGHT_REFERENCE_INSTANT).toEqual({ date: '2026-03-20', minutesSinceMidnight: 630 })
  })

  it('builds a lighting input at that place and instant with no offset, no north bearing, and a clear sky', () => {
    expect(referenceLightingInput()).toEqual({
      latLong: DAYLIGHT_REFERENCE_PLACE,
      observedAt: DAYLIGHT_REFERENCE_INSTANT,
      utcOffsetMinutes: 0,
      northBearing: 0,
      cloudCover: 0,
    })
  })

  it('puts the sun 44.9877 degrees above the horizon', () => {
    const input = referenceLightingInput()
    const { altitude } = solarPosition({
      latitude: input.latLong.latitude,
      longitude: input.latLong.longitude,
      observedAt: input.observedAt,
      utcOffsetMinutes: input.utcOffsetMinutes,
    })

    expect(Math.abs(altitude * DEGREES_PER_RADIAN - REFERENCE_SUN_HEIGHT_DEGREES)).toBeLessThan(
      REFERENCE_SUN_HEIGHT_TOLERANCE_DEGREES,
    )
  })
})
