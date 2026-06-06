import { describe, expect, it } from 'vitest'
import type { Point } from '../model/types'
import { createWall } from '../model/factories'
import { deriveRooms } from './rooms'

function byXThenY(a: Point, b: Point): number {
  return a.x - b.x || a.y - b.y
}

describe('deriveRooms', () => {
  it('derives one room from a single closed loop of walls', () => {
    const walls = [
      createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }),
      createWall({ x: 4000, y: 0 }, { x: 4000, y: 3000 }),
      createWall({ x: 4000, y: 3000 }, { x: 0, y: 3000 }),
      createWall({ x: 0, y: 3000 }, { x: 0, y: 0 }),
    ]

    const rooms = deriveRooms(walls)

    expect(rooms).toHaveLength(1)

    const room = rooms[0]
    if (room === undefined) {
      throw new Error('expected exactly one room')
    }
    expect(room.polygon).toHaveLength(4)

    const expectedCorners: Point[] = [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 3000 },
      { x: 0, y: 3000 },
    ]
    expect([...room.polygon].sort(byXThenY)).toEqual(expectedCorners.sort(byXThenY))
  })

  it('reports the room area as the positive shoelace area of its polygon', () => {
    const walls = [
      createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }),
      createWall({ x: 4000, y: 0 }, { x: 4000, y: 3000 }),
      createWall({ x: 4000, y: 3000 }, { x: 0, y: 3000 }),
      createWall({ x: 0, y: 3000 }, { x: 0, y: 0 }),
    ]

    const rooms = deriveRooms(walls)

    expect(rooms).toHaveLength(1)

    const room = rooms[0]
    if (room === undefined) {
      throw new Error('expected exactly one room')
    }
    expect(room.area).toBe(12_000_000)
  })

  it('excludes a dangling stub wall from the derived room polygon', () => {
    const walls = [
      createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }),
      createWall({ x: 4000, y: 0 }, { x: 4000, y: 3000 }),
      createWall({ x: 4000, y: 3000 }, { x: 0, y: 3000 }),
      createWall({ x: 0, y: 3000 }, { x: 0, y: 0 }),
      createWall({ x: 4000, y: 0 }, { x: 3000, y: 1000 }),
    ]

    const rooms = deriveRooms(walls)

    expect(rooms).toHaveLength(1)

    const room = rooms[0]
    if (room === undefined) {
      throw new Error('expected exactly one room')
    }
    expect(room.polygon).toHaveLength(4)
    expect(room.area).toBe(12_000_000)
  })

  it('splits an enclosure into two rooms when a partition wall divides it into two cells', () => {
    const walls = [
      createWall({ x: 0, y: 0 }, { x: 6000, y: 0 }),
      createWall({ x: 0, y: 3000 }, { x: 6000, y: 3000 }),
      createWall({ x: 0, y: 0 }, { x: 0, y: 3000 }),
      createWall({ x: 6000, y: 0 }, { x: 6000, y: 3000 }),
      createWall({ x: 3000, y: 0 }, { x: 3000, y: 3000 }),
    ]

    const rooms = deriveRooms(walls)

    expect(rooms).toHaveLength(2)
    expect(rooms.map((room) => room.area).sort((a, b) => a - b)).toEqual([9_000_000, 9_000_000])
  })

  it('never reports the unbounded outer face as a room', () => {
    const walls = [
      createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }),
      createWall({ x: 4000, y: 0 }, { x: 4000, y: 3000 }),
      createWall({ x: 4000, y: 3000 }, { x: 0, y: 3000 }),
      createWall({ x: 0, y: 3000 }, { x: 0, y: 0 }),
    ]

    const rooms = deriveRooms(walls)

    expect(rooms).toHaveLength(1)
    expect(rooms.every((room) => room.area > 0)).toBe(true)
  })

  it('encloses no room when the walls form an open chain that never closes into a loop', () => {
    const walls = [
      createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }),
      createWall({ x: 4000, y: 0 }, { x: 4000, y: 3000 }),
      createWall({ x: 4000, y: 3000 }, { x: 0, y: 3000 }),
    ]

    expect(deriveRooms(walls)).toHaveLength(0)
  })
})
