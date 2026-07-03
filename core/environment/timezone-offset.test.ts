import { describe, expect, it } from 'vitest'
import { utcOffsetMinutesFor } from './timezone-offset'

// Expected offsets are stable facts of the IANA timezone database for these dates.
const EDT_OFFSET_MINUTES = -240
const EST_OFFSET_MINUTES = -300
const AEST_OFFSET_MINUTES = 600
const INDIA_OFFSET_MINUTES = 330

// Longitudes (degrees, east positive) and their solar-time fallback offsets,
// derived from the Earth's rotation of 15 degrees of longitude per hour.
const NEW_YORK_LONGITUDE = -75
const NEW_YORK_SOLAR_OFFSET_MINUTES = -300
const TOKYO_LONGITUDE = 139.7

describe('utcOffsetMinutesFor', () => {
  it('resolves a daylight-saving offset for a summer date', () => {
    expect(utcOffsetMinutesFor('America/New_York', '2026-07-03')).toBe(EDT_OFFSET_MINUTES)
  })

  it('resolves a standard-time offset for a winter date in the same zone', () => {
    expect(utcOffsetMinutesFor('America/New_York', '2026-01-15')).toBe(EST_OFFSET_MINUTES)
  })

  it('resolves a southern-hemisphere zone outside its daylight-saving season', () => {
    expect(utcOffsetMinutesFor('Australia/Melbourne', '2026-06-21')).toBe(AEST_OFFSET_MINUTES)
  })

  it('resolves a half-hour offset zone', () => {
    expect(utcOffsetMinutesFor('Asia/Kolkata', '2026-07-03')).toBe(INDIA_OFFSET_MINUTES)
  })

  it('resolves UTC to a zero offset', () => {
    expect(utcOffsetMinutesFor('UTC', '2026-07-03')).toBe(0)
  })

  it('falls back to UTC when the timezone is missing', () => {
    expect(utcOffsetMinutesFor(undefined, '2026-07-03')).toBe(0)
  })

  it('falls back to UTC for an unrecognized timezone id without throwing', () => {
    expect(utcOffsetMinutesFor('Not/AZone', '2026-07-03')).toBe(0)
  })

  it('falls back to a longitude-based solar-time estimate when the timezone is missing', () => {
    expect(utcOffsetMinutesFor(undefined, '2026-07-03', NEW_YORK_LONGITUDE)).toBe(
      NEW_YORK_SOLAR_OFFSET_MINUTES,
    )
  })

  it('falls back to a longitude-based solar-time estimate for an unrecognized timezone id', () => {
    expect(utcOffsetMinutesFor('Not/AZone', '2026-07-03', NEW_YORK_LONGITUDE)).toBe(
      NEW_YORK_SOLAR_OFFSET_MINUTES,
    )
  })

  it('prefers a recognized timezone over a contradictory fallback longitude', () => {
    expect(utcOffsetMinutesFor('America/New_York', '2026-07-03', TOKYO_LONGITUDE)).toBe(
      EDT_OFFSET_MINUTES,
    )
  })
})
