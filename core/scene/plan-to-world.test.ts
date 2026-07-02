import { describe, it, expect } from 'vitest'
import { planToWorld, worldToPlan } from './plan-to-world'

describe('planToWorld', () => {
  it('maps plan x to world X and plan north (+y) to world -Z at the given height', () => {
    // The plan is rendered y-up (worldToScreen negates y), so larger plan y is
    // north. North must map to world -Z so the three-dimensional scene is not a
    // mirror image of the plan, and so it agrees with the camera-preset axis map.
    expect(planToWorld({ x: 3, y: 7 }, 2700)).toEqual({ x: 3, y: 2700, z: -7 })
  })

  it('places a point on the finished floor at world Y = 0', () => {
    expect(planToWorld({ x: -1, y: 4 }, 0)).toEqual({ x: -1, y: 0, z: -4 })
  })

  it('preserves plan orientation rather than reflecting it', () => {
    // The plan basis (east = +x, north = +y) is right-handed for a viewer looking
    // down at the y-up plan. Laid onto the ground it must stay right-handed about
    // world up (+Y): east cross north points to the sky (+Y), not the ground.
    // A reflecting map (the prior z = +y bug) points it at -Y.
    const origin = planToWorld({ x: 0, y: 0 }, 0)
    const east = planToWorld({ x: 1, y: 0 }, 0)
    const north = planToWorld({ x: 0, y: 1 }, 0)
    const e = { x: east.x - origin.x, z: east.z - origin.z }
    const n = { x: north.x - origin.x, z: north.z - origin.z }
    const crossUp = e.z * n.x - e.x * n.z // +Y component of east x north
    expect(crossUp).toBeGreaterThan(0)
  })
})

describe('worldToPlan', () => {
  it('maps a world point back to its plan point, dropping height and negating Z', () => {
    // World X is plan x, world -Z is plan north (+y), and world Y (height) is
    // discarded: worldToPlan is the ground-plane inverse of planToWorld.
    expect(worldToPlan({ x: 100, y: 2500, z: -300 })).toEqual({ x: 100, y: 300 })
  })

  it('round-trips a plan point through planToWorld at an arbitrary height', () => {
    const point = { x: 42, y: 900 }
    expect(worldToPlan(planToWorld(point, 2700))).toEqual(point)
  })

  it('round-trips a point on the floor line (plan y = 0) back to plan y = 0', () => {
    // The naive -point.y would yield world z = -0 when plan y = 0; planToWorld
    // uses 0 - point.y instead to land on a clean +0. Negating that with 0 -
    // world.z also gives +0, so the round-trip compares equal to 0.
    const onFloorLine = { x: 5, y: 0 }
    expect(worldToPlan(planToWorld(onFloorLine, 0))).toEqual(onFloorLine)
  })

  it('locks the sign both ways: negative plan y maps through positive world Z', () => {
    // A plan point south of the origin (y < 0) becomes world z > 0, and mapping
    // it back must restore the negative plan y.
    const world = planToWorld({ x: -7, y: -50 }, 1200)
    expect(world.z).toBeGreaterThan(0)
    expect(worldToPlan(world)).toEqual({ x: -7, y: -50 })
  })
})
