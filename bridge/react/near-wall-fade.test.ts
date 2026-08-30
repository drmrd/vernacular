import { describe, expect, it } from 'vitest'

import type { Point, Vector3 } from '../../core'
import { fadeCameraOutside } from './near-wall-fade'

function point(x: number, y: number): Point {
  return { x, y }
}

function world(x: number, y: number, z: number): Vector3 {
  return { x, y, z }
}

// A single axis-aligned square room spanning (0,0)..(4000,4000) in plan mm, with a
// building top of 3000mm (an eye-height camera sits comfortably under it).
const room: readonly Point[] = [point(0, 0), point(4000, 0), point(4000, 4000), point(0, 4000)]
const BUILDING_TOP_WORLD_MM = 3000
const EYE_HEIGHT_WORLD_MM = 1700
const ABOVE_ROOF_WORLD_MM = 8000

describe('fadeCameraOutside', () => {
  it('engages the fade for a camera above the building top, even inside the footprint in plan', () => {
    // Plan (2000, 2000) sits squarely inside the room, but the camera hovers well above
    // the building's top elevation, so the fade must stay engaged rather than stand down.
    const outside = fadeCameraOutside(world(2000, ABOVE_ROOF_WORLD_MM, -2000), {
      roomPolygons: [room],
      buildingTopWorld: BUILDING_TOP_WORLD_MM,
    })

    expect(outside).toBe(true)
  })

  it('stands the fade down for a camera inside the footprint at eye height', () => {
    // Plan (2000, 2000) sits squarely inside the room and the camera sits at ordinary
    // eye height, well under the building's top elevation.
    const outside = fadeCameraOutside(world(2000, EYE_HEIGHT_WORLD_MM, -2000), {
      roomPolygons: [room],
      buildingTopWorld: BUILDING_TOP_WORLD_MM,
    })

    expect(outside).toBe(false)
  })
})
