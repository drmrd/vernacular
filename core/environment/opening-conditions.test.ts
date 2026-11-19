import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CLOUD_COVER,
  MINUTES_PER_DAY,
  daylightSiteFor,
  openingConditions,
  openingInstant,
  solarPosition,
  sunWorldDirection,
} from '../index'
import type { ObservationInstant, PlanDirection } from '../index'
import type { Site } from '../model/site'

// The fixed instant: the March equinox at half past ten. 10:30 is 630 minutes after midnight.
const FIXED_DATE = '2026-03-20'
const FIXED_MINUTES_SINCE_MIDNIGHT = 630
const FIXED_INSTANT = { date: FIXED_DATE, minutesSinceMidnight: FIXED_MINUTES_SINCE_MIDNIGHT }

const MINUTES_PER_HOUR = 60

// A minute suits a front when the sun is at least this high and its direction makes at least this
// cosine with the front's outward normal laid flat on the ground.
const MIN_SUN_ALTITUDE_DEGREES = 25
const MIN_FRONT_COSINE = 0.5
const HALF_TURN_DEGREES = 180
const FULL_TURN_DEGREES = 360
const FRONT_STEP_DEGREES = 10

const NORTH_AMERICAN_LATITUDE = 40.71
const NORTH_AMERICAN_LONGITUDE = -74.01
const SOUTH_WEST_FRONT_X = 0.6
const SOUTH_WEST_FRONT_Y = -0.8

// Sites whose north the project cannot know: it is implied from the front, so sample daylight
// already turns the sun to the front and the fixed instant applies.
const SITES_WITH_AN_IMPLIED_NORTH: readonly { label: string; site: Site | undefined }[] = [
  { label: 'no site', site: undefined },
  { label: 'an empty site', site: {} },
  { label: 'a site whose north bearing is not a number', site: { northBearing: Number.NaN } },
  {
    label: 'a site whose latitude is not a number',
    site: { latLong: { latitude: Number.NaN, longitude: 0 } },
  },
]

const FRONTS: readonly { label: string; front: PlanDirection }[] = [
  { label: 'south front', front: { x: 0, y: -1 } },
  { label: 'north front', front: { x: 0, y: 1 } },
  { label: 'east front', front: { x: 1, y: 0 } },
  { label: 'west front', front: { x: -1, y: 0 } },
  { label: 'south-west front', front: { x: SOUTH_WEST_FRONT_X, y: SOUTH_WEST_FRONT_Y } },
]

// The sample place with a stored north bearing: the north is set, so the front is not implied.
const NORTH_SET_SITE: Site = { northBearing: 0 }

const NAMED_FRONTS_OF_A_HOUSE_WITH_A_SET_NORTH: readonly {
  label: string
  front: PlanDirection
  minutesSinceMidnight: number
}[] = [
  { label: 'south', front: { x: 0, y: -1 }, minutesSinceMidnight: clockMinutes(10, 30) },
  { label: 'east', front: { x: 1, y: 0 }, minutesSinceMidnight: clockMinutes(10, 0) },
  { label: 'west', front: { x: -1, y: 0 }, minutesSinceMidnight: clockMinutes(14, 0) },
]

const FRONT_ANGLES_AROUND_THE_CIRCLE: readonly number[] = Array.from(
  { length: FULL_TURN_DEGREES / FRONT_STEP_DEGREES },
  (_, step) => step * FRONT_STEP_DEGREES,
)

const LOCATED_SITE: Site = {
  latLong: { latitude: NORTH_AMERICAN_LATITUDE, longitude: NORTH_AMERICAN_LONGITUDE },
  timezone: 'America/New_York',
  northBearing: 0,
}

function clockMinutes(hours: number, minutes: number): number {
  return hours * MINUTES_PER_HOUR + minutes
}

function radiansOf(degrees: number): number {
  return (degrees * Math.PI) / HALF_TURN_DEGREES
}

function frontAtAngle(degrees: number): PlanDirection {
  return { x: Math.cos(radiansOf(degrees)), y: Math.sin(radiansOf(degrees)) }
}

function everySiteAndFront(): { label: string; site: Site | undefined; front: PlanDirection }[] {
  return SITES_WITH_AN_IMPLIED_NORTH.flatMap(({ label: siteLabel, site }) =>
    FRONTS.map(({ label: frontLabel, front }) => ({
      label: `${siteLabel}, ${frontLabel}`,
      site,
      front,
    })),
  )
}

// The rule of the opening time, written from its statement: the sun is high enough, and the unit
// direction toward it makes a large enough cosine with the front's outward normal in the ground
// plane (plan +y is world -Z).
function frontTakesSunAt(front: PlanDirection, observedAt: ObservationInstant): boolean {
  const daylight = daylightSiteFor(NORTH_SET_SITE, front, observedAt.date)
  const angles = solarPosition({
    latitude: daylight.latLong.latitude,
    longitude: daylight.latLong.longitude,
    observedAt,
    utcOffsetMinutes: daylight.utcOffsetMinutes,
  })
  const towardSun = sunWorldDirection(angles, daylight.northBearing)
  const frontNormal = { x: front.x, y: 0, z: -front.y }
  const cosine =
    towardSun.x * frontNormal.x + towardSun.y * frontNormal.y + towardSun.z * frontNormal.z
  return angles.altitude >= radiansOf(MIN_SUN_ALTITUDE_DEGREES) && cosine >= MIN_FRONT_COSINE
}

function minutesOfTheFixedDateThatSuit(front: PlanDirection): number[] {
  return Array.from({ length: MINUTES_PER_DAY }, (_, minutes) => minutes).filter((minutes) =>
    frontTakesSunAt(front, { date: FIXED_DATE, minutesSinceMidnight: minutes }),
  )
}

function distanceFromTheFixedMinutes(minutesSinceMidnight: number): number {
  return Math.abs(minutesSinceMidnight - FIXED_MINUTES_SINCE_MIDNIGHT)
}

describe('openingConditions', () => {
  it.each(everySiteAndFront())(
    'opens a site whose north is implied at 20 March 10:30 under the default cloud cover: $label',
    ({ site, front }) => {
      expect(openingConditions({ site, front })).toEqual({
        observedAt: FIXED_INSTANT,
        cloudCover: DEFAULT_CLOUD_COVER,
      })
    },
  )

  it.each(NAMED_FRONTS_OF_A_HOUSE_WITH_A_SET_NORTH)(
    'opens a house whose north is set at the minute of 20 March nearest 10:30 at which the sun is at least 25 degrees up and meets the front at a cosine of at least 0.5: front to the $label',
    ({ front, minutesSinceMidnight }) => {
      const conditions = openingConditions({ site: NORTH_SET_SITE, front })

      expect(conditions).toEqual({
        observedAt: { date: FIXED_DATE, minutesSinceMidnight },
        cloudCover: DEFAULT_CLOUD_COVER,
      })
      expect(frontTakesSunAt(front, conditions.observedAt)).toBe(true)
    },
  )

  // A front that takes no sun at all on 20 March falls to a later date, so it is not asked here.
  it.each(FRONT_ANGLES_AROUND_THE_CIRCLE)(
    'opens a house whose north is set at a minute of 20 March that suits its front, with none nearer 10:30, for a front %i degrees from plan-right',
    (degrees) => {
      const front = frontAtAngle(degrees)
      const suitable = minutesOfTheFixedDateThatSuit(front)
      if (suitable.length === 0) return
      const { observedAt } = openingConditions({ site: NORTH_SET_SITE, front })
      const chosenDistance = distanceFromTheFixedMinutes(observedAt.minutesSinceMidnight)

      const nearerThanChosen = suitable.filter(
        (minutes) => distanceFromTheFixedMinutes(minutes) < chosenDistance,
      )

      expect(observedAt.date).toBe(FIXED_DATE)
      expect(suitable).toContain(observedAt.minutesSinceMidnight)
      expect(nearerThanChosen).toEqual([])
    },
  )
})

describe('openingInstant', () => {
  it('keeps the fixed instant for a located site with a set north', () => {
    expect(openingInstant({ site: LOCATED_SITE })).toEqual(FIXED_INSTANT)
  })
})
