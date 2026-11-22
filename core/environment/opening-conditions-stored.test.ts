import { describe, expect, it } from 'vitest'
import { DEFAULT_CLOUD_COVER, openingConditions } from '../index'
import type { PlanDirection, ViewingConditions } from '../index'
import type { Site } from '../model/site'

const STORED_DATE = '2026-06-21'
const STORED_MINUTES_SINCE_MIDNIGHT = 480
const STORED_CLOUD_COVER = 0.4
const STORED_INSTANT = {
  date: STORED_DATE,
  minutesSinceMidnight: STORED_MINUTES_SINCE_MIDNIGHT,
}

const STORED_WITH_WEATHER: ViewingConditions = {
  observedAt: '2026-06-21T08:00',
  weather: { cloudCover: STORED_CLOUD_COVER },
}
const STORED_WITHOUT_WEATHER: ViewingConditions = { observedAt: '2026-06-21T08:00' }
const STORED_WITH_EMPTY_WEATHER: ViewingConditions = { observedAt: '2026-06-21T08:00', weather: {} }
const STORED_WITH_A_MALFORMED_TIME: ViewingConditions = { observedAt: 'noon' }

const NORTH_FRONT: PlanDirection = { x: 0, y: 1 }
const WEST_FRONT: PlanDirection = { x: -1, y: 0 }
const SOUTH_FRONT: PlanDirection = { x: 0, y: -1 }
const NORTH_SET_SITE: Site = { northBearing: 0 }
const NEW_YORK_SITE: Site = {
  latLong: { latitude: 40.71, longitude: -74.01 },
  timezone: 'America/New_York',
  northBearing: 0,
}

// Without a stored light these are the opening times the guess gives (see opening-conditions.test).
const GUESSED_WEST_INSTANT = { date: '2026-03-20', minutesSinceMidnight: 840 }
const GUESSED_IMPLIED_NORTH_INSTANT = { date: '2026-03-20', minutesSinceMidnight: 630 }

const SITES_AND_FRONTS: readonly { label: string; site: Site | undefined; front: PlanDirection }[] =
  [
    { label: 'no site', site: undefined, front: SOUTH_FRONT },
    { label: 'a set north with a shaded north front', site: NORTH_SET_SITE, front: NORTH_FRONT },
    { label: 'a located site', site: NEW_YORK_SITE, front: SOUTH_FRONT },
  ]

describe('openingConditions with a stored light', () => {
  it.each(SITES_AND_FRONTS)(
    'opens in the stored time and cloud cover, whatever the front takes: $label',
    ({ site, front }) => {
      expect(openingConditions({ site, front, stored: STORED_WITH_WEATHER })).toEqual({
        observedAt: STORED_INSTANT,
        cloudCover: STORED_CLOUD_COVER,
      })
    },
  )

  it.each([
    { label: 'no weather', stored: STORED_WITHOUT_WEATHER },
    { label: 'a weather with no cloud cover', stored: STORED_WITH_EMPTY_WEATHER },
  ])('opens in the default cloud cover when the stored light has $label', ({ stored }) => {
    expect(openingConditions({ site: undefined, front: SOUTH_FRONT, stored })).toEqual({
      observedAt: STORED_INSTANT,
      cloudCover: DEFAULT_CLOUD_COVER,
    })
  })

  it('ignores a stored light whose time is malformed and opens as if none were stored', () => {
    const input = { site: NORTH_SET_SITE, front: WEST_FRONT }

    expect(openingConditions({ ...input, stored: STORED_WITH_A_MALFORMED_TIME })).toEqual({
      observedAt: GUESSED_WEST_INSTANT,
      cloudCover: DEFAULT_CLOUD_COVER,
    })
    expect(openingConditions({ ...input, stored: STORED_WITH_A_MALFORMED_TIME })).toEqual(
      openingConditions(input),
    )
  })

  it('opens as on the guessed time when nothing is stored', () => {
    expect(openingConditions({ site: undefined, front: SOUTH_FRONT })).toEqual({
      observedAt: GUESSED_IMPLIED_NORTH_INSTANT,
      cloudCover: DEFAULT_CLOUD_COVER,
    })
    expect(openingConditions({ site: NORTH_SET_SITE, front: WEST_FRONT })).toEqual({
      observedAt: GUESSED_WEST_INSTANT,
      cloudCover: DEFAULT_CLOUD_COVER,
    })
  })
})
