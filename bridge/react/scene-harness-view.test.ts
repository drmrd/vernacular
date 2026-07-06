import { describe, it, expect } from 'vitest'
import type { CameraPose, ObservationInstant, Site } from '../../core'
import { ADJACENT_ROOMS_CAMERA_POSE } from './adjacent-rooms-fixture'
import { resolveHarnessCameraPose, type HarnessEnvironment } from './scene-harness-view'

// A well-formed inland east-coast site. The resolver keys on the poses, not on any
// solar math, so the exact coordinates only need to form a valid Site.
const SITE: Site = {
  latLong: { latitude: 40, longitude: -75 },
  northBearing: 0,
  timezone: 'America/New_York',
}

// Any well-formed instant; the resolver never reads it.
const OBSERVED_AT: ObservationInstant = {
  date: '2026-06-21',
  minutesSinceMidnight: 540,
}

// A pose distinct from ADJACENT_ROOMS_CAMERA_POSE so each assertion can tell which
// source the resolver chose: an interior vantage standing inside the room, aimed
// east and slightly down toward the window sill.
const ENVIRONMENT_CAMERA_POSE: CameraPose = {
  position: { x: 1200, y: 1500, z: -1500 },
  target: { x: 4000, y: 900, z: -1500 },
  near: 100,
  far: 20000,
}

const ENVIRONMENT_WITHOUT_POSE: HarnessEnvironment = {
  site: SITE,
  observedAt: OBSERVED_AT,
  realistic: true,
}

const ENVIRONMENT_WITH_POSE: HarnessEnvironment = {
  ...ENVIRONMENT_WITHOUT_POSE,
  cameraPose: ENVIRONMENT_CAMERA_POSE,
}

describe('resolveHarnessCameraPose', () => {
  it('prefers the environment camera pose for a geometry with no override', () => {
    expect(resolveHarnessCameraPose('shell', ENVIRONMENT_WITH_POSE)).toBe(ENVIRONMENT_CAMERA_POSE)
  })

  it('prefers the environment camera pose over a geometry override', () => {
    expect(resolveHarnessCameraPose('adjacent-rooms', ENVIRONMENT_WITH_POSE)).toBe(
      ENVIRONMENT_CAMERA_POSE,
    )
  })

  it('falls back to the geometry override when the environment supplies no pose', () => {
    expect(resolveHarnessCameraPose('adjacent-rooms', ENVIRONMENT_WITHOUT_POSE)).toBe(
      ADJACENT_ROOMS_CAMERA_POSE,
    )
  })

  it('auto-frames (undefined) with neither an environment pose nor a geometry override', () => {
    expect(resolveHarnessCameraPose('shell', ENVIRONMENT_WITHOUT_POSE)).toBeUndefined()
    expect(resolveHarnessCameraPose('shell')).toBeUndefined()
  })
})
