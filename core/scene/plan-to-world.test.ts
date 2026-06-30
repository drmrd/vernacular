import { describe, it, expect } from 'vitest'
import { planToWorld } from './plan-to-world'

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
