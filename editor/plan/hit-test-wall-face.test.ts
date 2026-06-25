import { describe, it, expect } from 'vitest'
import type { WallSceneNode } from '../../core'
import { hitTestWallFace } from './hit-test-wall-face'

const WALL_THICKNESS_MM = 200
const HALF_THICKNESS_MM = WALL_THICKNESS_MM / 2
const TOLERANCE_MM = 150

// A horizontal wall running left to right along the x axis through the origin.
// Its direction is +x, so the perpendicular is +y: the `left` face sits above
// (positive y) and the `right` face below (negative y), matching offsetBand.
function horizontalWall(): WallSceneNode {
  return {
    id: 'w1',
    kind: 'wall',
    floorId: 'g',
    start: { x: 0, y: 0 },
    end: { x: 1000, y: 0 },
    thickness: WALL_THICKNESS_MM,
  }
}

describe('hitTestWallFace', () => {
  it('resolves the left face for a point on the positive-perpendicular side of the wall', () => {
    const wall = horizontalWall()

    const hit = hitTestWallFace([wall], { x: 500, y: HALF_THICKNESS_MM }, TOLERANCE_MM)

    expect(hit).toEqual({ wallId: 'w1', side: 'left' })
  })

  it('resolves the right face for a point on the negative-perpendicular side of the wall', () => {
    const wall = horizontalWall()

    const hit = hitTestWallFace([wall], { x: 500, y: -HALF_THICKNESS_MM }, TOLERANCE_MM)

    expect(hit).toEqual({ wallId: 'w1', side: 'right' })
  })

  it('returns null when the point is past the tolerance band beyond the outer face', () => {
    const wall = horizontalWall()

    const beyond = HALF_THICKNESS_MM + TOLERANCE_MM + 1
    const hit = hitTestWallFace([wall], { x: 500, y: beyond }, TOLERANCE_MM)

    expect(hit).toBeNull()
  })

  it('returns null when the point lies off the end of the wall segment', () => {
    const wall = horizontalWall()

    const hit = hitTestWallFace(
      [wall],
      { x: 1000 + TOLERANCE_MM + 1, y: HALF_THICKNESS_MM },
      TOLERANCE_MM,
    )

    expect(hit).toBeNull()
  })

  it('returns null when there are no walls', () => {
    const hit = hitTestWallFace([], { x: 500, y: HALF_THICKNESS_MM }, TOLERANCE_MM)

    expect(hit).toBeNull()
  })
})
