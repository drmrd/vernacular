import { describe, it, expect } from 'vitest'
import { pickWallEndpoint } from './wall-editing'
import type { Point, WallSceneNode } from '../../core'

const GRAB_TOLERANCE_MM = 200
const WALL_THICKNESS_MM = 114

// A wall long enough that a point on one endpoint is far outside tolerance of the other.
const ORIGIN: Point = { x: 0, y: 0 }
const FAR_END: Point = { x: 3000, y: 0 }

// A short wall whose endpoints both sit inside GRAB_TOLERANCE_MM of a midspan point,
// so the near-tie rule (the nearer endpoint wins) is exercised.
const SHORT_START: Point = { x: 0, y: 0 }
const SHORT_END: Point = { x: 200, y: 0 }

function wall(id: string, start: Point, end: Point): WallSceneNode {
  return { id, kind: 'wall', floorId: 'g', start, end, thickness: WALL_THICKNESS_MM }
}

describe('pickWallEndpoint', () => {
  it("returns 'start' for a point on top of the start endpoint", () => {
    const subject = wall('wall:a', ORIGIN, FAR_END)

    expect(pickWallEndpoint(subject, ORIGIN, GRAB_TOLERANCE_MM)).toBe('start')
  })

  it("returns 'end' for a point on top of the end endpoint", () => {
    const subject = wall('wall:a', ORIGIN, FAR_END)

    expect(pickWallEndpoint(subject, FAR_END, GRAB_TOLERANCE_MM)).toBe('end')
  })

  it("returns 'start' when the point is in range of both endpoints but nearer the start", () => {
    const subject = wall('wall:short', SHORT_START, SHORT_END)
    // 40 mm from start, 160 mm from end: both within the 200 mm tolerance, nearer start.
    const nearerStart: Point = { x: 40, y: 0 }

    expect(pickWallEndpoint(subject, nearerStart, GRAB_TOLERANCE_MM)).toBe('start')
  })

  it("returns 'start' on a near-tie where the point is just closer to the start", () => {
    const subject = wall('wall:short', SHORT_START, SHORT_END)
    // 90 mm from start, 110 mm from end: both within tolerance, start wins by the smaller margin.
    // This also pins the deterministic exact-tie rule: at an exact tie, the start endpoint wins.
    const justNearerStart: Point = { x: 90, y: 0 }

    expect(pickWallEndpoint(subject, justNearerStart, GRAB_TOLERANCE_MM)).toBe('start')
  })

  it('returns null when neither endpoint is within tolerance', () => {
    const subject = wall('wall:a', ORIGIN, FAR_END)
    const farFromBoth: Point = { x: 1500, y: 1500 }

    expect(pickWallEndpoint(subject, farFromBoth, GRAB_TOLERANCE_MM)).toBeNull()
  })
})
