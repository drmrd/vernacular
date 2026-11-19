import { daylightSiteFor, type DaylightSite } from './daylight-site'
import { DAYLIGHT_REFERENCE_INSTANT } from './daylight-reference'
import { MINUTES_PER_DAY, type ObservationInstant } from './observation-time'
import { DEFAULT_CLOUD_COVER } from './sky-model'
import { solarPosition } from './solar-position'
import { sunWorldDirection } from './sun-world-direction'
import type { Site } from '../model/site'
import type { PlanDirection } from '../scene/front-direction'

export type OpeningInstantInput = { readonly site: Site | undefined }

/**
 * The one place that decides the instant a session opens at. Today it returns the same
 * instant for every input. The `site` parameter is the seam for a later rule; a rule that
 * depends on the site would also need the session state, which reads this once at module
 * load with no site, to be seeded for each project.
 */
export function openingInstant(input: OpeningInstantInput): ObservationInstant {
  void input
  return DAYLIGHT_REFERENCE_INSTANT
}

export type OpeningConditionsInput = {
  readonly site: Site | undefined
  readonly front: PlanDirection
}

export type OpeningConditions = {
  readonly observedAt: ObservationInstant
  readonly cloudCover: number
}

/** The date a scan for the time chosen for the house tries first: the March equinox. */
const EQUINOX_DATE = DAYLIGHT_REFERENCE_INSTANT.date
/** The minute of the day the scan is nearest to: 10:30. */
const PREFERRED_MINUTE = DAYLIGHT_REFERENCE_INSTANT.minutesSinceMidnight
/** The lowest sun height at which a minute qualifies, in degrees above the horizon. */
const MINIMUM_SUN_HEIGHT_DEGREES = 25
/** The lowest cosine between the direction toward the sun and the front's normal at which a minute qualifies. */
const MINIMUM_FRONT_COSINE = 0.5
const HALF_TURN_IN_DEGREES = 180
const DEGREES_PER_RADIAN = HALF_TURN_IN_DEGREES / Math.PI

function sunLightsFront(
  daylightSite: DaylightSite,
  front: PlanDirection,
  observedAt: ObservationInstant,
): boolean {
  const angles = solarPosition({
    latitude: daylightSite.latLong.latitude,
    longitude: daylightSite.latLong.longitude,
    observedAt,
    utcOffsetMinutes: daylightSite.utcOffsetMinutes,
  })
  if (angles.altitude * DEGREES_PER_RADIAN < MINIMUM_SUN_HEIGHT_DEGREES) return false
  const sun = sunWorldDirection(angles, daylightSite.northBearing)
  return sun.x * front.x - sun.z * front.y >= MINIMUM_FRONT_COSINE
}

/** The minutes of a day, from the one nearest 10:30 outward; of two equally near, the earlier first. */
function minutesNearestPreferred(): number[] {
  const minutes = Array.from({ length: MINUTES_PER_DAY }, (_, minute) => minute)
  return minutes.sort(
    (a, b) => Math.abs(a - PREFERRED_MINUTE) - Math.abs(b - PREFERRED_MINUTE) || a - b,
  )
}

const MINUTES_NEAREST_PREFERRED = minutesNearestPreferred()

/** The qualifying minute of the date nearest 10:30, or undefined when no minute qualifies. */
function nearestQualifyingMinute(
  daylightSite: DaylightSite,
  front: PlanDirection,
  date: string,
): number | undefined {
  return MINUTES_NEAREST_PREFERRED.find((minutesSinceMidnight) =>
    sunLightsFront(daylightSite, front, { date, minutesSinceMidnight }),
  )
}

/**
 * The instant and the cloud cover a project opens at, for a site and the front of its house.
 * A site whose north is implied from the front opens at the fixed instant under the default
 * cloud cover. Any other site opens at the minute of 20 March 2026 nearest 10:30 at which the
 * sun is at least 25 degrees above the horizon and the unit vector toward the sun has a dot
 * product of at least 0.5 with the front's normal laid in the ground plane. The place, the
 * UTC offset, and the north come from `daylightSiteFor`, resolved once for the date. Of two
 * minutes equally near 10:30 the earlier wins. When no minute of that date qualifies, the
 * fixed instant applies.
 */
export function openingConditions(input: OpeningConditionsInput): OpeningConditions {
  const daylightSite = daylightSiteFor(input.site, input.front, EQUINOX_DATE)
  const minutesSinceMidnight =
    daylightSite.sample === 'location-and-north'
      ? undefined
      : nearestQualifyingMinute(daylightSite, input.front, EQUINOX_DATE)
  const observedAt =
    minutesSinceMidnight === undefined
      ? openingInstant({ site: input.site })
      : { date: EQUINOX_DATE, minutesSinceMidnight }
  return { observedAt, cloudCover: DEFAULT_CLOUD_COVER }
}
