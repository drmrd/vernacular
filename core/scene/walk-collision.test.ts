import { describe, it, expect } from 'vitest'
import { resolveWalkCollision, type WallSegment } from './walk-collision'

// A wall lying along the world X axis at z = 0, long enough that its endpoints do
// not interfere with the near-origin cases. The walker is a circle of this radius
// in the horizontal (x, z) plane.
const wallAlongX: WallSegment = {
  start: { x: -1000, z: 0 },
  end: { x: 1000, z: 0 },
}
const radius = 300

describe('resolveWalkCollision', () => {
  it('clamps a straight-in move to the radius, slides a glancing move, and leaves clear moves alone', () => {
    // A position farther than the radius from the wall is untouched.
    const clear = resolveWalkCollision({ x: 0, z: -500 }, [wallAlongX], radius)
    expect(clear.x).toBeCloseTo(0, 5)
    expect(clear.z).toBeCloseTo(-500, 5)

    // Stepping straight into the wall is pushed back out to exactly the radius,
    // perpendicular to the wall, with no sideways drift.
    const straightIn = resolveWalkCollision({ x: 0, z: -100 }, [wallAlongX], radius)
    expect(straightIn.x).toBeCloseTo(0, 5)
    expect(straightIn.z).toBeCloseTo(-radius, 5)

    // A glancing move keeps its along-wall component (it slides) while the
    // into-wall component is clamped to the radius, rather than stopping dead.
    const glancing = resolveWalkCollision({ x: 400, z: -100 }, [wallAlongX], radius)
    expect(glancing.x).toBeCloseTo(400, 5)
    expect(glancing.z).toBeCloseTo(-radius, 5)

    // Past the end of a finite wall the nearest point is the endpoint, so a move
    // beyond the radius from that endpoint is not blocked.
    const pastEnd = resolveWalkCollision({ x: 1500, z: -100 }, [wallAlongX], radius)
    expect(pastEnd.x).toBeCloseTo(1500, 5)
    expect(pastEnd.z).toBeCloseTo(-100, 5)
  })
})
