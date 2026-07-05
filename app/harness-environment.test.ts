import { describe, it, expect } from 'vitest'
import type { Site } from '../core'
import {
  harnessEnvironmentState,
  resolveHarnessScene,
  HARNESS_GEOMETRY_SCENE_KEYS,
} from './harness-environment'

// The canonical site pins latitude 40, longitude -75 to match the solar-position
// reference cases in core/environment/solar-position.test.ts, and the
// America/New_York timezone exercised in core/environment/timezone-offset.test.ts,
// so harness baselines reuse the solar model's verified reference geometry.
const canonicalSite: Site = {
  latLong: { latitude: 40, longitude: -75 },
  northBearing: 0,
  timezone: 'America/New_York',
}

describe('harnessEnvironmentState', () => {
  it('resolves equinox-noon to spring-equinox noon at the canonical site in realistic mode', () => {
    expect(harnessEnvironmentState('equinox-noon')).toEqual({
      site: canonicalSite,
      observedAt: { date: '2026-03-20', minutesSinceMidnight: 720 },
      realistic: true,
    })
  })

  it('resolves winter-afternoon to a winter-solstice afternoon at the canonical site in realistic mode', () => {
    expect(harnessEnvironmentState('winter-afternoon')).toEqual({
      site: canonicalSite,
      observedAt: { date: '2026-12-21', minutesSinceMidnight: 960 },
      realistic: true,
    })
  })

  it('resolves an absent name to undefined so the harness stays on its schematic default', () => {
    expect(harnessEnvironmentState(null)).toBeUndefined()
  })

  it('resolves an unknown name to undefined so a typo cannot silently change baselines', () => {
    expect(harnessEnvironmentState('no-such-scene')).toBeUndefined()
  })

  it('varies only the observation instant between the named states so baselines isolate sun motion', () => {
    const equinoxNoon = harnessEnvironmentState('equinox-noon')
    const winterAfternoon = harnessEnvironmentState('winter-afternoon')

    expect(equinoxNoon).toBeDefined()
    expect(winterAfternoon).toBeDefined()
    expect(winterAfternoon?.site).toEqual(equinoxNoon?.site)
    expect(winterAfternoon?.observedAt).not.toEqual(equinoxNoon?.observedAt)
    expect({ ...equinoxNoon, observedAt: winterAfternoon?.observedAt }).toEqual(winterAfternoon)
  })

  it('resolves color-check to equinox-noon at the canonical site with the color check on', () => {
    expect(harnessEnvironmentState('color-check')).toEqual({
      site: canonicalSite,
      observedAt: { date: '2026-03-20', minutesSinceMidnight: 720 },
      realistic: true,
      colorCheck: true,
    })
  })

  it('resolves overcast-noon to equinox-noon at the canonical site with full cloud cover', () => {
    expect(harnessEnvironmentState('overcast-noon')).toEqual({
      site: canonicalSite,
      observedAt: { date: '2026-03-20', minutesSinceMidnight: 720 },
      realistic: true,
      cloudCover: 1,
    })
  })

  it('resolves the existing named states without the new cloud-cover or color-check fields', () => {
    const equinoxNoon = harnessEnvironmentState('equinox-noon')
    const winterAfternoon = harnessEnvironmentState('winter-afternoon')

    expect(equinoxNoon?.cloudCover).toBeUndefined()
    expect(equinoxNoon?.colorCheck).toBeUndefined()
    expect(winterAfternoon?.cloudCover).toBeUndefined()
    expect(winterAfternoon?.colorCheck).toBeUndefined()
  })

  it('resolves ambient-occlusion to equinox-noon at the canonical site with the furniture fixture', () => {
    expect(harnessEnvironmentState('ambient-occlusion')).toEqual({
      site: canonicalSite,
      observedAt: { date: '2026-03-20', minutesSinceMidnight: 720 },
      realistic: true,
      scene: 'furniture',
    })
  })

  it('resolves the existing named states without the new scene fixture field', () => {
    const equinoxNoon = harnessEnvironmentState('equinox-noon')
    const winterAfternoon = harnessEnvironmentState('winter-afternoon')

    expect(equinoxNoon?.scene).toBeUndefined()
    expect(winterAfternoon?.scene).toBeUndefined()
  })
})

describe('resolveHarnessScene', () => {
  it('resolves a geometry fixture key to itself', () => {
    expect(resolveHarnessScene('junctions')).toBe('junctions')
    expect(resolveHarnessScene('furniture')).toBe('furniture')
    expect(resolveHarnessScene('adjacent-rooms')).toBe('adjacent-rooms')
  })

  it('resolves an environment state name to its paired geometry fixture', () => {
    expect(resolveHarnessScene('ambient-occlusion')).toBe('furniture')
  })

  it('resolves an environment state without a paired fixture to undefined', () => {
    expect(resolveHarnessScene('equinox-noon')).toBeUndefined()
  })

  it('resolves an unknown scene name to undefined', () => {
    expect(resolveHarnessScene('no-such-scene')).toBeUndefined()
  })

  it('resolves an absent scene param to undefined', () => {
    expect(resolveHarnessScene(undefined)).toBeUndefined()
  })
})

describe('HARNESS_GEOMETRY_SCENE_KEYS', () => {
  it('shares no key with the named environment states, so the scene query param stays unambiguous', () => {
    for (const geometryKey of HARNESS_GEOMETRY_SCENE_KEYS) {
      expect(harnessEnvironmentState(geometryKey)).toBeUndefined()
    }
  })
})
