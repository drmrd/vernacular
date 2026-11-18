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

/** The stored north bearing when it is a finite number; otherwise it counts as missing. */
function usableNorthBearing(site: Site | undefined): number | undefined {
  const bearing = site?.northBearing
  return bearing !== undefined && Number.isFinite(bearing) ? bearing : undefined
}

/** The stored location when both coordinates are finite numbers; otherwise it counts as missing. */
function usableLatLong(site: Site | undefined): LatLong | undefined {
  const latLong = site?.latLong
  return latLong !== undefined &&
    Number.isFinite(latLong.latitude) &&
    Number.isFinite(latLong.longitude)
    ? latLong
    : undefined
}

/**
 * Which parts of the stored site are a sample: none, the location, or the
 * location and north. A north bearing that is not a finite number counts as missing.
 * A stored location with a latitude or longitude that is not a finite number
 * counts as missing.
 */
export function daylightSampleOf(site: Site | undefined): DaylightSample {
  if (usableLatLong(site) !== undefined) return 'none'
  if (usableNorthBearing(site) !== undefined) return 'location'
  return 'location-and-north'
}

/**
 * The site the sun is computed for. A stored location is kept as it is. Without
 * one, the sample place stands in, and a stored north bearing is kept; with no
 * bearing either, north is implied so that true south is the front. A north
 * bearing that is not a finite number counts as missing, so it is never kept.
 * A stored location with a latitude or longitude that is not a finite number
 * counts as missing.
 */
export function daylightSiteFor(
  site: Site | undefined,
  front: PlanDirection,
  date: string,
): DaylightSite {
  const sample = daylightSampleOf(site)
  const latLong = usableLatLong(site)
  if (latLong !== undefined) {
    return {
      latLong,
      northBearing: usableNorthBearing(site) ?? 0,
      utcOffsetMinutes: utcOffsetMinutesFor(site?.timezone, date, latLong.longitude),
      sample,
    }
  }
  return {
    latLong: DAYLIGHT_REFERENCE_PLACE,
    northBearing: usableNorthBearing(site) ?? Math.atan2(front.x, -front.y),
    utcOffsetMinutes: SAMPLE_UTC_OFFSET_MINUTES,
    sample,
  }
}
