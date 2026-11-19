import { describe, expect, it } from 'vitest'
import { DEFAULT_CLOUD_COVER, openingConditions, openingInstant } from '../index'
import type { PlanDirection } from '../index'
import type { Site } from '../model/site'

// The fixed instant: the March equinox at half past ten. 10:30 is 630 minutes after midnight.
const FIXED_DATE = '2026-03-20'
const FIXED_MINUTES_SINCE_MIDNIGHT = 630
const FIXED_INSTANT = { date: FIXED_DATE, minutesSinceMidnight: FIXED_MINUTES_SINCE_MIDNIGHT }

const NORTH_AMERICAN_LATITUDE = 40.71
const NORTH_AMERICAN_LONGITUDE = -74.01
const SOUTH_WEST_FRONT_X = 0.6
const SOUTH_WEST_FRONT_Y = -0.8

// Sites whose north the project cannot know: it is implied from the front, so sample daylight
// already turns the sun to the front and the fixed instant applies.
const SITES_WITH_AN_IMPLIED_NORTH: readonly (Site | undefined)[] = [
  undefined,
  {},
  { northBearing: Number.NaN },
  { latLong: { latitude: Number.NaN, longitude: 0 } },
]

const FRONTS: readonly PlanDirection[] = [
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: SOUTH_WEST_FRONT_X, y: SOUTH_WEST_FRONT_Y },
]

const LOCATED_SITE: Site = {
  latLong: { latitude: NORTH_AMERICAN_LATITUDE, longitude: NORTH_AMERICAN_LONGITUDE },
  timezone: 'America/New_York',
  northBearing: 0,
}

function everySiteAndFront(): { site: Site | undefined; front: PlanDirection }[] {
  return SITES_WITH_AN_IMPLIED_NORTH.flatMap((site) => FRONTS.map((front) => ({ site, front })))
}

describe('openingConditions', () => {
  it('opens a site whose north is implied at 20 March 10:30 under the default cloud cover, for every front', () => {
    const conditions = everySiteAndFront().map((input) => openingConditions(input))

    const expected = conditions.map(() => ({
      observedAt: FIXED_INSTANT,
      cloudCover: DEFAULT_CLOUD_COVER,
    }))
    expect(conditions).toEqual(expected)
  })
})

describe('openingInstant', () => {
  it('keeps the fixed instant for a located site with a set north', () => {
    expect(openingInstant({ site: LOCATED_SITE })).toEqual(FIXED_INSTANT)
  })
})
