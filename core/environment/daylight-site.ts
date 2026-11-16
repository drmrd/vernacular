import type { LatLong, Site } from '../model/site'
import type { PlanDirection } from '../scene/front-direction'
import { DAYLIGHT_REFERENCE_PLACE } from './daylight-reference'
import { utcOffsetMinutesFor } from './timezone-offset'

/** The site the sun is computed for, and which parts of it are a sample. */
export interface DaylightSite {
  latLong: LatLong
  /** Radians, plan-up to true north. */
  northBearing: number
  utcOffsetMinutes: number
  sample: 'none' | 'location' | 'location-and-north'
}

export type DaylightSample = DaylightSite['sample']

/** The sample place reads solar time, so its clock offset is zero. */
const SAMPLE_UTC_OFFSET_MINUTES = 0

/** Which parts of the stored site are a sample: none, the location, or the location and north. */
export function daylightSampleOf(site: Site | undefined): DaylightSample {
  if (site?.latLong !== undefined) return 'none'
  if (site?.northBearing !== undefined) return 'location'
  return 'location-and-north'
}

/**
 * The site the sun is computed for. A stored location is kept as it is. Without
 * one, the sample place stands in, and a stored north bearing is kept; with no
 * bearing either, north is implied so that true south is the front.
 */
export function daylightSiteFor(
  site: Site | undefined,
  front: PlanDirection,
  date: string,
): DaylightSite {
  const sample = daylightSampleOf(site)
  if (site?.latLong !== undefined) {
    return {
      latLong: site.latLong,
      northBearing: site.northBearing ?? 0,
      utcOffsetMinutes: utcOffsetMinutesFor(site.timezone, date, site.latLong.longitude),
      sample,
    }
  }
  return {
    latLong: DAYLIGHT_REFERENCE_PLACE,
    northBearing: site?.northBearing ?? Math.atan2(front.x, -front.y),
    utcOffsetMinutes: SAMPLE_UTC_OFFSET_MINUTES,
    sample,
  }
}
