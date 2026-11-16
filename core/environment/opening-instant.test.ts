import { describe, expect, it } from 'vitest'
import type { Site } from '../model/site'
import { openingInstant } from './opening-instant'

// A session opens at the March equinox, mid-morning: 10:30 is 630 minutes after midnight. The
// instant is the same with or without a site, because the sun stands where the daylight
// calibration expects it either way.
const OPENING_INSTANT = { date: '2026-03-20', minutesSinceMidnight: 630 }

const LOCATED_SITE: Site = {
  latLong: { latitude: 51.5, longitude: -0.1 },
  northBearing: 0.3,
  timezone: 'Europe/London',
}

describe('openingInstant', () => {
  it('gives the March equinox at half past ten when there is no site', () => {
    expect(openingInstant({ site: undefined })).toEqual(OPENING_INSTANT)
  })

  it('gives the same instant for a located site', () => {
    expect(openingInstant({ site: LOCATED_SITE })).toEqual(OPENING_INSTANT)
  })
})
