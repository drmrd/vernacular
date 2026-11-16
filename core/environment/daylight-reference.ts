import type { LatLong } from '../model/site'
import type { EnvironmentLightingInput } from './environment-lighting'
import type { ObservationInstant } from './observation-time'

/** The place the daylight is calibrated at: latitude 40 north, longitude 1.86 east. */
export const DAYLIGHT_REFERENCE_PLACE: LatLong = { latitude: 40, longitude: 1.86 }

/** The instant the daylight is calibrated at: the March equinox, mid-morning. */
export const DAYLIGHT_REFERENCE_INSTANT: ObservationInstant = {
  date: '2026-03-20',
  minutesSinceMidnight: 630,
}

/** The lighting input of the calibration: the reference place and instant, UTC, north up, clear sky. */
export function referenceLightingInput(): EnvironmentLightingInput {
  return {
    latLong: DAYLIGHT_REFERENCE_PLACE,
    observedAt: DAYLIGHT_REFERENCE_INSTANT,
    utcOffsetMinutes: 0,
    northBearing: 0,
    cloudCover: 0,
  }
}
