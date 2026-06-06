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
})
