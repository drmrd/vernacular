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

// The shell room's clear floor lives at plan (60,60)..(3940,2940), 2600 mm tall; planToWorld
// maps plan (x, y) to world (x, height, -y), so a camera target on the floor sits within these
// world bounds. Shared by the interior-camera states (window-light, color-accuracy).
function expectTargetOnShellFloor(target: { x: number; y: number; z: number } | undefined): void {
  expect(target).toBeDefined()
  expect(target?.x).toBeGreaterThan(0)
  expect(target?.x).toBeLessThan(4000)
  expect(target?.z).toBeGreaterThan(-3000)
  expect(target?.z).toBeLessThan(0)
  expect(target?.y).toBeGreaterThanOrEqual(0)
  expect(target?.y).toBeLessThanOrEqual(2600)
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

  it('resolves window-light to a summer-solstice morning at the canonical site with the shell fixture and an interior camera pose', () => {
    const windowLight = harnessEnvironmentState('window-light')

    expect(windowLight).toMatchObject({
      site: canonicalSite,
      observedAt: { date: '2026-06-21', minutesSinceMidnight: 540 },
      realistic: true,
      scene: 'shell',
    })

    expectTargetOnShellFloor(windowLight?.cameraPose?.target)
  })

  it('resolves the existing named states without the new camera pose field', () => {
    expect(harnessEnvironmentState('equinox-noon')?.cameraPose).toBeUndefined()
    expect(harnessEnvironmentState('winter-afternoon')?.cameraPose).toBeUndefined()
    expect(harnessEnvironmentState('color-check')?.cameraPose).toBeUndefined()
    expect(harnessEnvironmentState('overcast-noon')?.cameraPose).toBeUndefined()
    expect(harnessEnvironmentState('ambient-occlusion')?.cameraPose).toBeUndefined()
  })

  it('resolves color-accuracy to the color-check reference lighting with a floor-framing camera', () => {
    const colorAccuracy = harnessEnvironmentState('color-accuracy')

    expect(colorAccuracy).toMatchObject({
      site: canonicalSite,
      observedAt: { date: '2026-03-20', minutesSinceMidnight: 720 },
      realistic: true,
      colorCheck: true,
      scene: 'shell',
    })

    const cameraPose = colorAccuracy?.cameraPose
    expect(cameraPose).toBeDefined()
    const pose = cameraPose as NonNullable<typeof cameraPose>

    expect(pose.position.y).toBeGreaterThan(pose.target.y)
    expect(pose.up).toEqual({ x: 0, y: 0, z: -1 })
    expectTargetOnShellFloor(pose.target)
  })

  it('resolves finish-contrast to the color-check reference lighting with the shell fixture and the color-accuracy camera pose', () => {
    const colorAccuracy = harnessEnvironmentState('color-accuracy')
    const finishContrast = harnessEnvironmentState('finish-contrast')

    expect(colorAccuracy).toBeDefined()
    expect(finishContrast).toEqual({
      site: canonicalSite,
      observedAt: { date: '2026-03-20', minutesSinceMidnight: 720 },
      realistic: true,
      colorCheck: true,
      scene: 'shell',
      cameraPose: colorAccuracy?.cameraPose,
    })
    expect(resolveHarnessScene('finish-contrast')).toBe('shell')
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

  it('resolves color-accuracy to the shell fixture', () => {
    expect(resolveHarnessScene('color-accuracy')).toBe('shell')
  })
})

describe('HARNESS_GEOMETRY_SCENE_KEYS', () => {
  it('shares no key with the named environment states, so the scene query param stays unambiguous', () => {
    for (const geometryKey of HARNESS_GEOMETRY_SCENE_KEYS) {
      expect(harnessEnvironmentState(geometryKey)).toBeUndefined()
    }
  })
})
