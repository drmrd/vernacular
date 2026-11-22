import { toDegrees } from './angle-units'
import { daylightSiteFor, type DaylightSite } from './daylight-site'
import { DAYLIGHT_REFERENCE_INSTANT } from './daylight-reference'
import {
  isObservationInstantIso,
  MINUTES_PER_DAY,
  parseObservationInstant,
  type ObservationInstant,
} from './observation-time'
import { DEFAULT_CLOUD_COVER } from './sky-model'
import { solarPosition } from './solar-position'
import { sunWorldDirection } from './sun-world-direction'
import type { Vector3 } from '../scene/vector3'
import type { OpeningLight, ViewingConditions } from '../model/environment-scene'
import type { Site } from '../model/site'
import type { PlanDirection } from '../scene/front-direction'

export type OpeningInstantInput = { readonly site: Site | undefined }

/**
 * The fixed instant a session opens at. It returns the same instant for every input, and its
 * callers rely on that. The time a project opens at is chosen from the site and the front by
 * `openingConditions`, and the editor shell seeds the session state from it once for each
 * opened project.
 */
export function openingInstant(input: OpeningInstantInput): ObservationInstant {
  void input
  return DAYLIGHT_REFERENCE_INSTANT
}

export type OpeningConditionsInput = {
  readonly site: Site | undefined
  readonly front: PlanDirection
  readonly stored?: ViewingConditions
}

export type OpeningConditions = {
  readonly observedAt: ObservationInstant
  readonly cloudCover: number
}

/** The date the opening scan tries first: the March equinox. */
const EQUINOX_DATE = DAYLIGHT_REFERENCE_INSTANT.date
/** The date tried second at a latitude of 0 or more: the June solstice. */
const JUNE_SOLSTICE_DATE = '2026-06-21'
/** The date tried second below latitude 0: the December solstice. */
const DECEMBER_SOLSTICE_DATE = '2026-12-21'
/** The minute of the day the scan is nearest to: 10:30. */
const PREFERRED_MINUTE = DAYLIGHT_REFERENCE_INSTANT.minutesSinceMidnight
/** The lowest sun height at which a minute qualifies, in degrees above the horizon. */
const MINIMUM_SUN_HEIGHT_DEGREES = 25
/** The lowest cosine between the direction toward the sun and the front's normal at which a minute qualifies. */
const MINIMUM_FRONT_COSINE = 0.5

function frontNormalCosine(sun: Vector3, front: PlanDirection): number {
  // Plan +y maps to world -Z, so the ground-plane normal of the front is (front.x, 0, -front.y).
  return sun.x * front.x - sun.z * front.y
}

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
  if (toDegrees(angles.altitude) < MINIMUM_SUN_HEIGHT_DEGREES) return false
  const sun = sunWorldDirection(angles, daylightSite.northBearing)
  return frontNormalCosine(sun, front) >= MINIMUM_FRONT_COSINE
}

/** The candidate minutes at one distance from the preferred minute, earlier first, inside the day. */
function minutesAtOffset(offset: number): number[] {
  const candidates =
    offset === 0 ? [PREFERRED_MINUTE] : [PREFERRED_MINUTE - offset, PREFERRED_MINUTE + offset]
  return candidates.filter((minute) => minute >= 0 && minute < MINUTES_PER_DAY)
}

/**
 * The qualifying minute of the date nearest 10:30, or undefined when no minute qualifies. The
 * scan walks outward from the preferred minute, and the order of the two candidates at one
 * distance is the tie rule: the earlier minute wins.
 */
function nearestQualifyingMinute(
  daylightSite: DaylightSite,
  front: PlanDirection,
  date: string,
): number | undefined {
  for (let offset = 0; offset < MINUTES_PER_DAY; offset += 1) {
    const found = minutesAtOffset(offset).find((minutesSinceMidnight) =>
      sunLightsFront(daylightSite, front, { date, minutesSinceMidnight }),
    )
    if (found !== undefined) return found
  }
  return undefined
}

/** A north that is implied from the front leaves no sun to aim at, so the fixed instant applies. */
function northIsImplied(daylightSite: DaylightSite): boolean {
  return daylightSite.sample === 'location-and-north'
}

/** The dates a scan tries, in order: the March equinox, then the solstice of the hemisphere. */
function datesToTry(daylightSite: DaylightSite): readonly string[] {
  // Latitude 0 counts as north.
  const solsticeDate =
    daylightSite.latLong.latitude >= 0 ? JUNE_SOLSTICE_DATE : DECEMBER_SOLSTICE_DATE
  return [EQUINOX_DATE, solsticeDate]
}

/**
 * The first date in the list with a qualifying minute, and that minute. The site is resolved
 * again for each date, because the offset from UTC depends on the date.
 */
function firstQualifyingInstant(
  input: OpeningConditionsInput,
  dates: readonly string[],
): ObservationInstant | undefined {
  for (const date of dates) {
    const daylightSite = daylightSiteFor(input.site, input.front, date)
    const minutesSinceMidnight = nearestQualifyingMinute(daylightSite, input.front, date)
    if (minutesSinceMidnight !== undefined) return { date, minutesSinceMidnight }
  }
  return undefined
}

/**
 * The conditions a stored opening light stands for, or undefined when there is none or its
 * `observedAt` does not have the `YYYY-MM-DDThh:mm` shape. A stored light that does not parse
 * is ignored wherever the project opens or reports its opening light.
 */
export function storedOpeningConditions(
  stored: OpeningLight | undefined,
): OpeningConditions | undefined {
  if (stored === undefined || !isObservationInstantIso(stored.observedAt)) return undefined
  return {
    observedAt: parseObservationInstant(stored.observedAt),
    cloudCover: stored.weather?.cloudCover ?? DEFAULT_CLOUD_COVER,
  }
}

/**
 * The instant and the cloud cover a project opens at. A valid stored light comes first, because
 * the light the user last chose outranks any guess from the site; a stored light that does not
 * parse is ignored and the rules below apply. A site whose north is implied opens at
 * the fixed instant. Any other site opens at the qualifying minute nearest 10:30, the earlier
 * of two equally near, on the first date that has one. The dates are tried in order: 20 March
 * 2026, then 21 June 2026 at a latitude of 0 or more or 21 December 2026 below 0. When no minute
 * of either date qualifies, the fixed instant applies.
 */
export function openingConditions(input: OpeningConditionsInput): OpeningConditions {
  const stored = storedOpeningConditions(input.stored)
  if (stored !== undefined) return stored
  const fixedInstant = openingInstant({ site: input.site })
  const equinoxSite = daylightSiteFor(input.site, input.front, EQUINOX_DATE)
  if (northIsImplied(equinoxSite))
    return { observedAt: fixedInstant, cloudCover: DEFAULT_CLOUD_COVER }
  const observedAt = firstQualifyingInstant(input, datesToTry(equinoxSite)) ?? fixedInstant
  return { observedAt, cloudCover: DEFAULT_CLOUD_COVER }
}
