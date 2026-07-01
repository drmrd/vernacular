import { describe, expect, it } from 'vitest'

import type { Point } from '../model/types'
import type { Vector3 } from './vector3'
import { cameraOutsideBuilding } from './camera-outside-building'

function point(x: number, y: number): Point {
  return { x, y }
}

function world(x: number, y: number, z: number): Vector3 {
  return { x, y, z }
}

// A single axis-aligned square room spanning (0,0)..(4000,4000) in plan mm.
// A plan point (px, py) corresponds to a world position { x: px, y: <height>, z: -py }.
const room: readonly Point[] = [point(0, 0), point(4000, 0), point(4000, 4000), point(0, 4000)]

describe('cameraOutsideBuilding', () => {
  it('engages the fade when the camera stands outside the building footprint', () => {
    // Plan (6000, 2000) is east of the room, so the world -Z of the plan y is -2000.
    expect(cameraOutsideBuilding(world(6000, 1600, -2000), [room])).toBe(true)
  })

  it('suppresses the fade when the camera is inside the building footprint', () => {
    // Plan (2000, 2000) sits squarely inside the room.
    expect(cameraOutsideBuilding(world(2000, 1600, -2000), [room])).toBe(false)
  })

  it('treats a camera exactly on a room edge as inside (boundary counts as inside)', () => {
    // Plan (2000, 0) lies on the room's south edge; world z of +0 round-trips to plan y 0.
    expect(cameraOutsideBuilding(world(2000, 1600, 0), [room])).toBe(false)
  })

  it('engages the fade when there is no building footprint to be inside of', () => {
    expect(cameraOutsideBuilding(world(2000, 1600, -2000), [])).toBe(true)
  })

  it('ignores the camera height (world Y) when deciding inside versus outside', () => {
    // A camera hovering far above an interior plan point is still inside the footprint.
    expect(cameraOutsideBuilding(world(2000, 99999, -2000), [room])).toBe(false)
  })
})
