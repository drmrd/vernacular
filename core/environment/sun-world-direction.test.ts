import { describe, expect, it } from 'vitest'
import { sunWorldDirection } from './sun-world-direction'
import type { SolarAngles } from './solar-position'

// The world frame is right-handed and Y-up (core/scene/vector3.ts). Plan north
// (+y) maps to world -Z (core/scene/plan-to-world.ts), and Site.northBearing is
// the angle from plan-up to true north in the y-up plan frame, counterclockwise
// (core/model/site.ts; editor/plan/compass-rotation.ts flips the sign only for
// the y-down screen frame). The returned vector points FROM the scene TOWARD
// the sun, so a light aimed opposite to it shines the way the sun does.

const COMPONENT_DECIMAL_PLACES = 5

function angles(azimuth: number, altitude: number): SolarAngles {
  return { azimuth, altitude }
}

describe('sunWorldDirection', () => {
  it('points a true-north horizon sun along world -Z when plan-up is true north', () => {
    const direction = sunWorldDirection(angles(0, 0), 0)
    expect(direction.x).toBeCloseTo(0, COMPONENT_DECIMAL_PLACES)
    expect(direction.y).toBeCloseTo(0, COMPONENT_DECIMAL_PLACES)
    expect(direction.z).toBeCloseTo(-1, COMPONENT_DECIMAL_PLACES)
  })

  it('points an eastern horizon sun along world +X when plan-up is true north', () => {
    const direction = sunWorldDirection(angles(Math.PI / 2, 0), 0)
    expect(direction.x).toBeCloseTo(1, COMPONENT_DECIMAL_PLACES)
    expect(direction.y).toBeCloseTo(0, COMPONENT_DECIMAL_PLACES)
    expect(direction.z).toBeCloseTo(0, COMPONENT_DECIMAL_PLACES)
  })

  it('points an overhead sun straight up along world +Y', () => {
    const direction = sunWorldDirection(angles(0, Math.PI / 2), 0)
    expect(direction.x).toBeCloseTo(0, COMPONENT_DECIMAL_PLACES)
    expect(direction.y).toBeCloseTo(1, COMPONENT_DECIMAL_PLACES)
    expect(direction.z).toBeCloseTo(0, COMPONENT_DECIMAL_PLACES)
  })

  it('returns a unit vector for an arbitrary sun position and north bearing', () => {
    const { x, y, z } = sunWorldDirection(angles(1.1, 0.4), 0.3)
    expect(x * x + y * y + z * z).toBeCloseTo(1, COMPONENT_DECIMAL_PLACES)
  })

  it('swings a true-north horizon sun to world -X for a quarter-turn bearing', () => {
    // Derivation chain: Site.northBearing is the angle from plan-up to true
    // north (core/model/site.ts). A +pi/2 bearing places true north a quarter
    // turn counterclockwise from plan-up in the y-up plan frame, along plan
    // (-1, 0); editor/plan/compass-rotation.test.ts renders that same bearing
    // as the needle swinging left. A sun at azimuth 0 sits at true north, so
    // its plan-frame direction is (-1, 0), and planToWorld maps plan x to
    // world X and plan +y to world -Z, landing the sun at world (-1, 0, 0).
    const direction = sunWorldDirection(angles(0, 0), Math.PI / 2)
    expect(direction.x).toBeCloseTo(-1, COMPONENT_DECIMAL_PLACES)
    expect(direction.y).toBeCloseTo(0, COMPONENT_DECIMAL_PLACES)
    expect(direction.z).toBeCloseTo(0, COMPONENT_DECIMAL_PLACES)
  })

  it('keeps east a clockwise quarter turn from north about world up at any bearing', () => {
    // Orientation backstop mirroring core/scene/plan-to-world.test.ts: east
    // cross north must point to the sky (+Y), not the ground, whatever the
    // bearing, so the mapping rotates the compass instead of reflecting it.
    const bearing = 0.7
    const north = sunWorldDirection(angles(0, 0), bearing)
    const east = sunWorldDirection(angles(Math.PI / 2, 0), bearing)
    const crossUp = east.z * north.x - east.x * north.z // +Y component of east x north
    expect(crossUp).toBeGreaterThan(0)
  })
})
