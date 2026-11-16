import { describe, it, expect } from 'vitest'
import { computeEnvironmentLighting, utcOffsetMinutesFor, type Site } from '../core'
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
      scene: 'shell-south-window',
    })
  })

  it('resolves winter-afternoon to a winter-solstice afternoon at the canonical site in realistic mode', () => {
    expect(harnessEnvironmentState('winter-afternoon')).toEqual({
      site: canonicalSite,
      observedAt: { date: '2026-12-21', minutesSinceMidnight: 960 },
      realistic: true,
      scene: 'shell-south-window',
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
      scene: 'shell-south-window',
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

  it('pairs the daylight states with the shell that has a south window', () => {
    expect(harnessEnvironmentState('equinox-noon')?.scene).toBe('shell-south-window')
    expect(harnessEnvironmentState('winter-afternoon')?.scene).toBe('shell-south-window')
    expect(harnessEnvironmentState('overcast-noon')?.scene).toBe('shell-south-window')
  })

  it('keeps the color and finish gates on the shell without a window and the color check on the bare scene', () => {
    expect(harnessEnvironmentState('color-check')?.scene).toBeUndefined()
    expect(harnessEnvironmentState('color-accuracy')?.scene).toBe('shell')
    expect(harnessEnvironmentState('finish-contrast')?.scene).toBe('shell')
    expect(harnessEnvironmentState('window-light')?.scene).toBe('shell')
    expect(harnessEnvironmentState('ambient-occlusion')?.scene).toBe('furniture')
  })

  it('resolves shadow-on-lawn to equinox noon at the canonical site with the south-window shell and a camera on the lawn north of the north wall', () => {
    const shadowOnLawn = harnessEnvironmentState('shadow-on-lawn')

    expect(shadowOnLawn).toMatchObject({
      site: canonicalSite,
      observedAt: { date: '2026-03-20', minutesSinceMidnight: 720 },
      realistic: true,
      scene: 'shell-south-window',
    })

    const pose = shadowOnLawn?.cameraPose as NonNullable<typeof shadowOnLawn>['cameraPose']
    expect(pose).toBeDefined()
    expect(pose?.position.y).toBeGreaterThan(0)
    expect(pose?.target.y).toBe(0)
    expect(pose?.target.z).toBeLessThan(-3060)
  })
})

describe('harnessEnvironmentState daylight reference', () => {
  it('resolves daylight-reference to a late-morning equinox at the sample site (40 N, 1.86 E) with the south-window shell and a south-west camera', () => {
    expect(harnessEnvironmentState('daylight-reference')).toEqual({
      site: {
        latLong: { latitude: 40, longitude: 1.86 },
        northBearing: 0,
        timezone: 'UTC',
      },
      observedAt: { date: '2026-03-20', minutesSinceMidnight: 630 },
      realistic: true,
      scene: 'shell-south-window',
      cameraPose: {
        position: { x: -4500, y: 3200, z: 5000 },
        target: { x: 2000, y: 1300, z: -1500 },
        near: 100,
        far: 40000,
      },
    })
  })
})

describe('harnessEnvironmentState low sun', () => {
  const lowSunInstant = { date: '2026-03-25', minutesSinceMidnight: 1145 }
  const DEGREES_PER_RADIAN = 180 / Math.PI
  const WEST_WALL_OUTWARD_NORMAL = { x: -1, z: 0 }
  const MIN_SUN_HEIGHT_DEGREES = 1
  const MAX_SUN_HEIGHT_DEGREES = 2
  const MIN_COSINE_TO_WEST_WALL = 0.95

  function lowSunLighting(): ReturnType<typeof computeEnvironmentLighting> {
    return computeEnvironmentLighting({
      latLong: { latitude: 40, longitude: -75 },
      northBearing: 0,
      utcOffsetMinutes: utcOffsetMinutesFor('America/New_York', lowSunInstant.date),
      observedAt: lowSunInstant,
      cloudCover: 0,
    })
  }

  it('resolves low-sun to a late-March evening at the canonical site with the south-window shell and the daylight-reference camera', () => {
    expect(harnessEnvironmentState('low-sun')).toEqual({
      site: canonicalSite,
      observedAt: lowSunInstant,
      realistic: true,
      scene: 'shell-south-window',
      cameraPose: harnessEnvironmentState('daylight-reference')?.cameraPose,
    })
  })

  it('puts the sun between 1 and 2 degrees above the horizon at the low-sun instant', () => {
    const sunHeightDegrees = Math.asin(lowSunLighting().sunDirection.y) * DEGREES_PER_RADIAN

    expect(sunHeightDegrees).toBeGreaterThan(MIN_SUN_HEIGHT_DEGREES)
    expect(sunHeightDegrees).toBeLessThan(MAX_SUN_HEIGHT_DEGREES)
  })

  it('puts the sun in the west at the low-sun instant, facing the outward normal of the west wall', () => {
    const { x, z } = lowSunLighting().sunDirection
    const horizontalLength = Math.hypot(x, z)
    const cosineToWestWall =
      (x * WEST_WALL_OUTWARD_NORMAL.x + z * WEST_WALL_OUTWARD_NORMAL.z) / horizontalLength

    expect(cosineToWestWall).toBeGreaterThan(MIN_COSINE_TO_WEST_WALL)
  })
})

describe('harnessEnvironmentState camera poses and fixtures', () => {
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

  it('resolves a daylight state to the shell that has a south window', () => {
    expect(resolveHarnessScene('equinox-noon')).toBe('shell-south-window')
  })

  it('resolves an environment state without a paired fixture to undefined', () => {
    expect(resolveHarnessScene('color-check')).toBeUndefined()
  })

  it('does not accept the south-window fixture key as a query value', () => {
    expect(resolveHarnessScene('shell-south-window')).toBeUndefined()
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
