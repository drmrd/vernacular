import { describe, expect, it } from 'vitest'
import type { Point, Wall } from '../model/types'
import { createWall } from '../model/factories'
import { deriveRooms } from './rooms'

function averageX(polygon: Point[]): number {
  return polygon.reduce((sum, point) => sum + point.x, 0) / polygon.length
}

function sharedInteriorWallWalls(): Wall[] {
  return [
    createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, { thickness: 200 }),
    createWall({ x: 4000, y: 0 }, { x: 8000, y: 0 }, { thickness: 200 }),
    createWall({ x: 8000, y: 0 }, { x: 8000, y: 3000 }, { thickness: 200 }),
    createWall({ x: 8000, y: 3000 }, { x: 4000, y: 3000 }, { thickness: 200 }),
    createWall({ x: 4000, y: 3000 }, { x: 0, y: 3000 }, { thickness: 200 }),
    createWall({ x: 0, y: 3000 }, { x: 0, y: 0 }, { thickness: 200 }),
    createWall({ x: 4000, y: 0 }, { x: 4000, y: 3000 }, { thickness: 200 }),
  ]
}

function spanningPerimeterPartitionWalls(): Wall[] {
  return [
    createWall({ x: 0, y: 0 }, { x: 6000, y: 0 }, { thickness: 200 }),
    createWall({ x: 0, y: 3000 }, { x: 6000, y: 3000 }, { thickness: 200 }),
    createWall({ x: 0, y: 0 }, { x: 0, y: 3000 }, { thickness: 200 }),
    createWall({ x: 6000, y: 0 }, { x: 6000, y: 3000 }, { thickness: 200 }),
    createWall({ x: 3000, y: 0 }, { x: 3000, y: 3000 }, { thickness: 200 }),
  ]
}

describe('deriveRooms shared interior wall', () => {
  it('stops each room outer boundary at the shared wall centerline so adjacent slabs meet without overlap', () => {
    const rooms = deriveRooms(sharedInteriorWallWalls())
    expect(rooms).toHaveLength(2)

    const [leftRoom, rightRoom] = [...rooms].sort(
      (a, b) => averageX(a.clearPolygon) - averageX(b.clearPolygon),
    )
    if (leftRoom === undefined || rightRoom === undefined) {
      throw new Error('expected a left room and a right room')
    }

    const leftOuterMaxX = Math.max(...leftRoom.outerPolygon.map((p) => p.x))
    const leftOuterMinX = Math.min(...leftRoom.outerPolygon.map((p) => p.x))
    const rightOuterMaxX = Math.max(...rightRoom.outerPolygon.map((p) => p.x))
    const rightOuterMinX = Math.min(...rightRoom.outerPolygon.map((p) => p.x))

    // Shared edge stays on the centerline; the left perimeter still outsets outward.
    expect(leftOuterMaxX).toBe(4000)
    expect(leftOuterMinX).toBe(-100)

    // Shared edge stays on the centerline; the right perimeter still outsets outward.
    expect(rightOuterMinX).toBe(4000)
    expect(rightOuterMaxX).toBe(8100)

    // The two outer boundaries meet edge to edge with no overlapping area.
    expect(leftOuterMaxX).toBeLessThanOrEqual(rightOuterMinX)

    // The clear interior is unchanged: still inset by half-thickness across the shared wall.
    expect(Math.max(...leftRoom.clearPolygon.map((p) => p.x))).toBe(3900)
  })

  it('still outsets a perimeter wall that spans past the partition and bounds both rooms', () => {
    const rooms = deriveRooms(spanningPerimeterPartitionWalls())
    expect(rooms).toHaveLength(2)

    const [leftRoom, rightRoom] = [...rooms].sort(
      (a, b) => averageX(a.clearPolygon) - averageX(b.clearPolygon),
    )
    if (leftRoom === undefined || rightRoom === undefined) {
      throw new Error('expected a left room and a right room')
    }

    const leftXs = leftRoom.outerPolygon.map((p) => p.x)
    const leftYs = leftRoom.outerPolygon.map((p) => p.y)
    const rightXs = rightRoom.outerPolygon.map((p) => p.x)
    const rightYs = rightRoom.outerPolygon.map((p) => p.y)

    // Partition stays on the centerline; left perimeter outsets outward.
    expect(Math.max(...leftXs)).toBe(3000)
    expect(Math.min(...leftXs)).toBe(-100)

    // Partition on the centerline; right perimeter outsets outward.
    expect(Math.min(...rightXs)).toBe(3000)
    expect(Math.max(...rightXs)).toBe(6100)

    // The spanning bottom and top walls still outset outward for both rooms,
    // because each is exterior on its far side despite bounding two rooms.
    expect(Math.min(...leftYs)).toBe(-100)
    expect(Math.max(...leftYs)).toBe(3100)
    expect(Math.min(...rightYs)).toBe(-100)
    expect(Math.max(...rightYs)).toBe(3100)
  })
})
