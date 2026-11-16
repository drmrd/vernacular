import { describe, expect, it } from 'vitest'
import type { Site } from '../model/site'
import type { PlanDirection } from '../scene/front-direction'
import type { Vector3 } from '../scene/vector3'
import { DAYLIGHT_REFERENCE_INSTANT, DAYLIGHT_REFERENCE_PLACE } from './daylight-reference'
import { daylightSampleOf, daylightSiteFor } from './daylight-site'
import type { DaylightSite } from './daylight-site'
import { computeEnvironmentLighting } from './environment-lighting'

// The daylight site is the site the sun is computed for. A stored location and north are kept as
// they are; a missing location falls back to the sample place, and a missing north is implied so
// the front faces due south (spec section 6.1). A plan front is a unit vector in the y-up plan
// frame; as a world vector it is (front.x, 0, -front.y).

const FRONT_DOWN: PlanDirection = { x: 0, y: -1 }
const FRONT_RIGHT: PlanDirection = { x: 1, y: 0 }
const FRONT_LEFT: PlanDirection = { x: -1, y: 0 }
const FRONT_UP: PlanDirection = { x: 0, y: 1 }
const FRONT_SLANTED: PlanDirection = { x: 0.6, y: -0.8 }
const FOUR_AXIS_FRONTS: readonly PlanDirection[] = [FRONT_DOWN, FRONT_RIGHT, FRONT_LEFT, FRONT_UP]
const SAMPLED_FRONTS: readonly PlanDirection[] = [...FOUR_AXIS_FRONTS, FRONT_SLANTED]

const SPRING_DATE = '2026-03-20'
const SUMMER_DATE = '2026-07-01'

const LONDON_LAT_LONG = { latitude: 51.5, longitude: -0.1 }
const LONDON_NORTH_BEARING = 0.3
const LONDON_TIMEZONE = 'Europe/London'
const LONDON_SPRING_OFFSET_MINUTES = 0
const LONDON_SUMMER_OFFSET_MINUTES = 60

const PHILADELPHIA_LAT_LONG = { latitude: 40, longitude: -75 }
const PHILADELPHIA_OFFSET_MINUTES = -300

const STORED_NORTH_BEARING = 1.2
const SAMPLE_OFFSET_MINUTES = 0

const SVALBARD_LAT_LONG = { latitude: 78.2, longitude: 15.6 }
const SVALBARD_TIMEZONE = 'Arctic/Longyearbyen'
const SVALBARD_SPRING_OFFSET_MINUTES = 60

const BEARING_DECIMAL_PLACES = 10
const SUN_HEIGHT_DEGREES = 45.0
const SUN_HEIGHT_TOLERANCE_DEGREES = 0.2
const DEGREES_PER_RADIAN = 180 / Math.PI
const FRONT_COSINE = 0.595
const FRONT_COSINE_TOLERANCE = 0.005
const FRONT_COSINE_FLOOR = 0.5
const SIDE_COSINE = 0.383
const SIDE_COSINE_TOLERANCE = 0.005

function withinTolerance(actual: number, expected: number, tolerance: number): boolean {
  return Math.abs(actual - expected) <= tolerance
}

function dot(sun: Vector3, plane: { x: number; y: number }): number {
  // A plan vector (x, y) is the world vector (x, 0, -y).
  return sun.x * plane.x + sun.z * -plane.y
}

function sunAtReferenceInstant(daylightSite: DaylightSite): Vector3 {
  return computeEnvironmentLighting({
    latLong: daylightSite.latLong,
    northBearing: daylightSite.northBearing,
    utcOffsetMinutes: daylightSite.utcOffsetMinutes,
    observedAt: DAYLIGHT_REFERENCE_INSTANT,
    cloudCover: 0,
  }).sunDirection
}

function eastOf(front: PlanDirection): { x: number; y: number } {
  return { x: -front.y, y: front.x }
}

function westOf(front: PlanDirection): { x: number; y: number } {
  return { x: front.y, y: -front.x }
}

function backOf(front: PlanDirection): { x: number; y: number } {
  return { x: -front.x, y: -front.y }
}

describe('a site with a location and a north bearing', () => {
  const site: Site = {
    latLong: LONDON_LAT_LONG,
    northBearing: LONDON_NORTH_BEARING,
    timezone: LONDON_TIMEZONE,
  }

  it('keeps its location and bearing, takes the zone offset of the date, and is no sample', () => {
    const spring = daylightSiteFor(site, FRONT_DOWN, SPRING_DATE)
    const summer = daylightSiteFor(site, FRONT_DOWN, SUMMER_DATE)

    expect(spring.latLong).toEqual(LONDON_LAT_LONG)
    expect(spring.northBearing).toBe(LONDON_NORTH_BEARING)
    expect(spring.utcOffsetMinutes).toBe(LONDON_SPRING_OFFSET_MINUTES)
    expect(spring.sample).toBe('none')
    expect(summer.latLong).toEqual(LONDON_LAT_LONG)
    expect(summer.northBearing).toBe(LONDON_NORTH_BEARING)
    expect(summer.utcOffsetMinutes).toBe(LONDON_SUMMER_OFFSET_MINUTES)
    expect(summer.sample).toBe('none')
  })
})

describe('a site with only a location', () => {
  it('keeps the location, points plan-up at north, and is no sample', () => {
    const daylightSite = daylightSiteFor(
      { latLong: PHILADELPHIA_LAT_LONG },
      FRONT_DOWN,
      SPRING_DATE,
    )

    expect(daylightSite.latLong).toEqual(PHILADELPHIA_LAT_LONG)
    expect(daylightSite.northBearing).toBe(0)
    expect(daylightSite.utcOffsetMinutes).toBe(PHILADELPHIA_OFFSET_MINUTES)
    expect(daylightSite.sample).toBe('none')
  })
})

describe('a site with only a north bearing', () => {
  it('uses the sample place and keeps the stored bearing for every front', () => {
    for (const front of SAMPLED_FRONTS) {
      const daylightSite = daylightSiteFor(
        { northBearing: STORED_NORTH_BEARING },
        front,
        SPRING_DATE,
      )

      expect(daylightSite.latLong).toEqual(DAYLIGHT_REFERENCE_PLACE)
      expect(daylightSite.northBearing).toBe(STORED_NORTH_BEARING)
      expect(daylightSite.utcOffsetMinutes).toBe(SAMPLE_OFFSET_MINUTES)
      expect(daylightSite.sample).toBe('location')
    }
  })

  it('keeps a bearing that leaves the front in shade, at a cosine of -0.595 to the sun', () => {
    const daylightSite = daylightSiteFor({ northBearing: Math.PI }, FRONT_DOWN, SPRING_DATE)
    const cosineToFront = dot(sunAtReferenceInstant(daylightSite), FRONT_DOWN)

    expect(daylightSite.northBearing).toBe(Math.PI)
    expect(daylightSite.sample).toBe('location')
    expect(withinTolerance(cosineToFront, -FRONT_COSINE, FRONT_COSINE_TOLERANCE)).toBe(true)
  })
})

describe('a site with a stored north bearing of zero', () => {
  it('keeps the zero as a bearing, not as a missing bearing, beside a missing location', () => {
    const daylightSite = daylightSiteFor({ northBearing: 0 }, FRONT_RIGHT, SPRING_DATE)

    expect(daylightSite.northBearing).toBe(0)
    expect(daylightSite.sample).toBe('location')
    expect(daylightSampleOf({ northBearing: 0 })).toBe('location')
  })

  it('keeps the zero as a bearing, beside a stored location, and is no sample', () => {
    const daylightSite = daylightSiteFor(
      { latLong: LONDON_LAT_LONG, northBearing: 0 },
      FRONT_RIGHT,
      SPRING_DATE,
    )

    expect(daylightSite.northBearing).toBe(0)
    expect(daylightSite.sample).toBe('none')
  })
})

describe('a site with neither a location nor a north bearing', () => {
  it.each([
    ['undefined', undefined],
    ['an empty site', {}],
  ] as const)('uses the sample place and offset, and a sample north, for %s', (_name, site) => {
    const daylightSite = daylightSiteFor(site, FRONT_DOWN, SPRING_DATE)

    expect(daylightSite.latLong).toEqual(DAYLIGHT_REFERENCE_PLACE)
    expect(daylightSite.utcOffsetMinutes).toBe(SAMPLE_OFFSET_MINUTES)
    expect(daylightSite.sample).toBe('location-and-north')
  })

  it('implies a bearing of 0 for a front pointing plan-down', () => {
    expect(daylightSiteFor(undefined, FRONT_DOWN, SPRING_DATE).northBearing).toBeCloseTo(
      0,
      BEARING_DECIMAL_PLACES,
    )
  })

  it('implies a bearing of pi/2 for a front pointing plan-right', () => {
    expect(daylightSiteFor(undefined, FRONT_RIGHT, SPRING_DATE).northBearing).toBeCloseTo(
      Math.PI / 2,
      BEARING_DECIMAL_PLACES,
    )
  })

  it('implies a bearing of -pi/2 for a front pointing plan-left', () => {
    expect(daylightSiteFor({}, FRONT_LEFT, SPRING_DATE).northBearing).toBeCloseTo(
      -Math.PI / 2,
      BEARING_DECIMAL_PLACES,
    )
  })

  it('implies a bearing of pi in absolute value for a front pointing plan-up', () => {
    expect(Math.abs(daylightSiteFor({}, FRONT_UP, SPRING_DATE).northBearing)).toBeCloseTo(
      Math.PI,
      BEARING_DECIMAL_PLACES,
    )
  })
})

describe('the sun at the reference instant over a sample site', () => {
  it.each(SAMPLED_FRONTS)('stands 45 degrees up for the front %o', (front) => {
    const sun = sunAtReferenceInstant(daylightSiteFor(undefined, front, SPRING_DATE))
    const heightDegrees = Math.asin(sun.y) * DEGREES_PER_RADIAN

    expect(withinTolerance(heightDegrees, SUN_HEIGHT_DEGREES, SUN_HEIGHT_TOLERANCE_DEGREES)).toBe(
      true,
    )
  })

  it.each(SAMPLED_FRONTS)('lights the front %o at a cosine of 0.595', (front) => {
    const sun = sunAtReferenceInstant(daylightSiteFor(undefined, front, SPRING_DATE))
    const cosineToFront = dot(sun, front)

    expect(withinTolerance(cosineToFront, FRONT_COSINE, FRONT_COSINE_TOLERANCE)).toBe(true)
    expect(cosineToFront).toBeGreaterThanOrEqual(FRONT_COSINE_FLOOR)
  })

  it.each(SAMPLED_FRONTS)('grazes the side east of the front %o at a cosine of 0.383', (front) => {
    const sun = sunAtReferenceInstant(daylightSiteFor(undefined, front, SPRING_DATE))

    expect(withinTolerance(dot(sun, eastOf(front)), SIDE_COSINE, SIDE_COSINE_TOLERANCE)).toBe(true)
  })

  it.each(SAMPLED_FRONTS)(
    'leaves the other side and the back of the front %o in shade',
    (front) => {
      const sun = sunAtReferenceInstant(daylightSiteFor(undefined, front, SPRING_DATE))

      expect(dot(sun, westOf(front))).toBeLessThan(0)
      expect(dot(sun, backOf(front))).toBeLessThan(0)
    },
  )
})

describe('a polar site with a location', () => {
  it('keeps its true sun, whatever the front, and is no sample', () => {
    const site: Site = { latLong: SVALBARD_LAT_LONG, timezone: SVALBARD_TIMEZONE }
    const trueSun = computeEnvironmentLighting({
      latLong: SVALBARD_LAT_LONG,
      northBearing: 0,
      utcOffsetMinutes: SVALBARD_SPRING_OFFSET_MINUTES,
      observedAt: DAYLIGHT_REFERENCE_INSTANT,
      cloudCover: 0,
    }).sunDirection

    for (const front of SAMPLED_FRONTS) {
      const daylightSite = daylightSiteFor(site, front, SPRING_DATE)

      expect(daylightSite.sample).toBe('none')
      expect(daylightSite.latLong).toEqual(SVALBARD_LAT_LONG)
      expect(sunAtReferenceInstant(daylightSite)).toEqual(trueSun)
    }
  })
})

const NON_FINITE_BEARINGS = [
  ['NaN', NaN],
  ['Infinity', Infinity],
  ['-Infinity', -Infinity],
] as const

function allNumbersOf(daylightSite: DaylightSite): number[] {
  const sun = sunAtReferenceInstant(daylightSite)
  return [
    daylightSite.latLong.latitude,
    daylightSite.latLong.longitude,
    daylightSite.northBearing,
    daylightSite.utcOffsetMinutes,
    sun.x,
    sun.y,
    sun.z,
  ]
}

describe('a site with a north bearing that is not a finite number', () => {
  it.each(NON_FINITE_BEARINGS)(
    'counts %s as a missing bearing beside a missing location',
    (_name, northBearing) => {
      const daylightSite = daylightSiteFor({ northBearing }, FRONT_RIGHT, SPRING_DATE)

      expect(daylightSite.northBearing).toBeCloseTo(Math.PI / 2, BEARING_DECIMAL_PLACES)
      expect(daylightSite.latLong).toEqual(DAYLIGHT_REFERENCE_PLACE)
      expect(daylightSite.utcOffsetMinutes).toBe(SAMPLE_OFFSET_MINUTES)
      expect(daylightSite.sample).toBe('location-and-north')
      expect(daylightSampleOf({ northBearing })).toBe('location-and-north')
      expect(allNumbersOf(daylightSite).every(Number.isFinite)).toBe(true)
    },
  )

  it.each(NON_FINITE_BEARINGS)(
    'counts %s as a missing bearing beside a stored location, and is no sample',
    (_name, northBearing) => {
      const daylightSite = daylightSiteFor(
        { latLong: LONDON_LAT_LONG, northBearing },
        FRONT_RIGHT,
        SPRING_DATE,
      )

      expect(daylightSite.northBearing).toBe(0)
      expect(daylightSite.latLong).toEqual(LONDON_LAT_LONG)
      expect(daylightSite.sample).toBe('none')
      expect(allNumbersOf(daylightSite).every(Number.isFinite)).toBe(true)
    },
  )

  it('keeps a finite negative bearing beside a missing location', () => {
    const daylightSite = daylightSiteFor(
      { northBearing: -STORED_NORTH_BEARING },
      FRONT_RIGHT,
      SPRING_DATE,
    )

    expect(daylightSite.northBearing).toBe(-STORED_NORTH_BEARING)
    expect(daylightSite.sample).toBe('location')
  })
})

describe('daylightSampleOf', () => {
  it.each([
    [
      'a location and a north bearing',
      { latLong: LONDON_LAT_LONG, northBearing: LONDON_NORTH_BEARING },
    ],
    ['only a location', { latLong: PHILADELPHIA_LAT_LONG }],
    ['only a north bearing', { northBearing: STORED_NORTH_BEARING }],
    ['neither a location nor a north bearing', {}],
    ['no site at all', undefined],
  ] as const)('agrees with the sample of daylightSiteFor for %s', (_name, site) => {
    expect(daylightSampleOf(site)).toBe(daylightSiteFor(site, FRONT_DOWN, SPRING_DATE).sample)
  })

  it('names the sample of each row of the table', () => {
    expect(daylightSampleOf({ latLong: LONDON_LAT_LONG, northBearing: LONDON_NORTH_BEARING })).toBe(
      'none',
    )
    expect(daylightSampleOf({ latLong: PHILADELPHIA_LAT_LONG })).toBe('none')
    expect(daylightSampleOf({ northBearing: STORED_NORTH_BEARING })).toBe('location')
    expect(daylightSampleOf(undefined)).toBe('location-and-north')
  })
})
