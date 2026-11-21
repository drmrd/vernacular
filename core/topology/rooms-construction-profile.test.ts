import { describe, expect, it } from 'vitest'
import type { Point, Wall } from '../model/types'
import { createWall } from '../model/factories'
import type { Room } from './rooms'
import { deriveRooms } from './rooms'

// The solid-masonry-brick assembly: plaster 16 mm plus brick 215 mm.
const MASONRY_ASSEMBLY_THICKNESS_MM = 231
const HALF_ASSEMBLY_MM = MASONRY_ASSEMBLY_THICKNESS_MM / 2

const ROOM_WIDTH_MM = 2000
const ROOM_DEPTH_MM = 1000

const CENTERLINE_CORNERS: Point[] = [
  { x: 0, y: 0 },
  { x: ROOM_WIDTH_MM, y: 0 },
  { x: ROOM_WIDTH_MM, y: ROOM_DEPTH_MM },
  { x: 0, y: ROOM_DEPTH_MM },
]

function expectCornerSet(polygon: Point[], expectedCorners: Point[]): void {
  expect(polygon).toHaveLength(expectedCorners.length)
  for (const corner of expectedCorners) {
    expect(polygon).toContainEqual(corner)
  }
}

function masonryRectangleWalls(): Wall[] {
  return CENTERLINE_CORNERS.map((corner, index) => {
    const next = CENTERLINE_CORNERS[(index + 1) % CENTERLINE_CORNERS.length]
    if (next === undefined) {
      throw new Error('expected a closing corner')
    }
    return { ...createWall(corner, next), constructionProfile: 'solid-masonry-brick' }
  })
}

function soleDerivedRoom(walls: Wall[]): Room {
  const [room, ...rest] = deriveRooms(walls)
  if (room === undefined || rest.length > 0) {
    throw new Error('expected exactly one derived room')
  }
  return room
}

describe('deriveRooms with construction-profile walls', () => {
  it('insets the clear polygon and its area by the assembly faces of the walls', () => {
    const room = soleDerivedRoom(masonryRectangleWalls())

    expectCornerSet(room.clearPolygon, [
      { x: HALF_ASSEMBLY_MM, y: HALF_ASSEMBLY_MM },
      { x: ROOM_WIDTH_MM - HALF_ASSEMBLY_MM, y: HALF_ASSEMBLY_MM },
      { x: ROOM_WIDTH_MM - HALF_ASSEMBLY_MM, y: ROOM_DEPTH_MM - HALF_ASSEMBLY_MM },
      { x: HALF_ASSEMBLY_MM, y: ROOM_DEPTH_MM - HALF_ASSEMBLY_MM },
    ])
    // (2000 - 231) x (1000 - 231) = 1769 x 769
    expect(room.area).toBe(1_360_361)
  })

  it('outsets the outer polygon to the assembly faces of the walls', () => {
    const room = soleDerivedRoom(masonryRectangleWalls())

    expectCornerSet(room.outerPolygon, [
      { x: -HALF_ASSEMBLY_MM, y: -HALF_ASSEMBLY_MM },
      { x: ROOM_WIDTH_MM + HALF_ASSEMBLY_MM, y: -HALF_ASSEMBLY_MM },
      { x: ROOM_WIDTH_MM + HALF_ASSEMBLY_MM, y: ROOM_DEPTH_MM + HALF_ASSEMBLY_MM },
      { x: -HALF_ASSEMBLY_MM, y: ROOM_DEPTH_MM + HALF_ASSEMBLY_MM },
    ])
  })
})
