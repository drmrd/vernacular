import { describe, expect, it } from 'vitest'
import type { LatLong, Site } from '../model/site'
import type { PlanDirection } from '../scene/front-direction'
import { DAYLIGHT_REFERENCE_PLACE } from './daylight-reference'
import { daylightSampleOf, daylightSiteFor } from './daylight-site'

// A stored location with a latitude or longitude that is not a finite number counts as missing, so
// the daylight site falls back to the sample place exactly as it does for a site with no location.

const FRONT_RIGHT: PlanDirection = { x: 1, y: 0 }
const SPRING_DATE = '2026-03-20'

const STORED_NORTH_BEARING = 1.2
const STORED_TIMEZONE = 'Europe/London'
const BEARING_DECIMAL_PLACES = 10

interface SiteCase {
  readonly location: LatLong
  readonly site: Site
  readonly siteWithoutLocation: Site
}

const NOT_FINITE_LOCATIONS: readonly LatLong[] = [
  { latitude: NaN, longitude: -75 },
  { latitude: 40, longitude: Infinity },
  { latitude: -Infinity, longitude: 0 },
]

function casesFor(location: LatLong): SiteCase[] {
  const others: Site[] = [{}, { northBearing: STORED_NORTH_BEARING }, { timezone: STORED_TIMEZONE }]
  return others.map((other) => ({
    location,
    site: { latLong: location, ...other },
    siteWithoutLocation: other,
  }))
}

describe('a site with a location that is not a finite number', () => {
  it.each(NOT_FINITE_LOCATIONS.flatMap(casesFor))(
    'reads as the same site without a location for $site',
    ({ site, siteWithoutLocation }) => {
      expect(daylightSiteFor(site, FRONT_RIGHT, SPRING_DATE)).toEqual(
        daylightSiteFor(siteWithoutLocation, FRONT_RIGHT, SPRING_DATE),
      )
      expect(daylightSampleOf(site)).toBe(daylightSampleOf(siteWithoutLocation))
    },
  )

  it('falls back to the sample place and implies the north from the front', () => {
    const site: Site = { latLong: { latitude: NaN, longitude: -75 } }

    const daylightSite = daylightSiteFor(site, FRONT_RIGHT, SPRING_DATE)

    expect(daylightSite.latLong).toEqual(DAYLIGHT_REFERENCE_PLACE)
    expect(daylightSite.utcOffsetMinutes).toBe(0)
    expect(daylightSite.sample).toBe('location-and-north')
    expect(daylightSite.northBearing).toBeCloseTo(Math.PI / 2, BEARING_DECIMAL_PLACES)
  })

  it('keeps a location at latitude 0 and longitude 0, which is a place and not a gap', () => {
    const site: Site = { latLong: { latitude: 0, longitude: 0 } }

    const daylightSite = daylightSiteFor(site, FRONT_RIGHT, SPRING_DATE)

    expect(daylightSite.latLong).toEqual({ latitude: 0, longitude: 0 })
    expect(daylightSampleOf(site)).toBe('none')
  })
})
