import { describe, expect, it } from 'vitest'
import type { Point, Wall } from '../model/types'
import { createWall } from '../model/factories'
import { deriveRooms, roomKey } from './rooms'

const ROOM_ID_PREFIX = 'room:'

const RECTANGLE_CORNERS: Point[] = [
  { x: 0, y: 0 },
  { x: 4000, y: 0 },
  { x: 4000, y: 3000 },
  { x: 0, y: 3000 },
]

function byXThenY(a: Point, b: Point): number {
  return a.x - b.x || a.y - b.y
}

function rectangleEdgesWithIds(): Wall[] {
  return RECTANGLE_CORNERS.map((corner, index) => {
    const next = RECTANGLE_CORNERS[(index + 1) % RECTANGLE_CORNERS.length]
    if (next === undefined) {
      throw new Error('expected a closing corner')
    }
    return createWall(corner, next, { id: `wall-${index}` })
  })
}

function onlyRoom(walls: Wall[]): { id: string; wallIds: string[] } {
  const rooms = deriveRooms(walls)
  const room = rooms[0]
  if (room === undefined || rooms.length !== 1) {
    throw new Error('expected exactly one derived room')
  }
  return room
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

  it('gives a room a stable room-prefixed id derived from its bounding wall ids', () => {
    const walls = [
      createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }),
      createWall({ x: 4000, y: 0 }, { x: 4000, y: 3000 }),
      createWall({ x: 4000, y: 3000 }, { x: 0, y: 3000 }),
      createWall({ x: 0, y: 3000 }, { x: 0, y: 0 }),
    ]

    const firstIds = deriveRooms(walls).map((room) => room.id)
    const secondIds = deriveRooms(walls).map((room) => room.id)
    expect(firstIds).toEqual(secondIds)
    expect(firstIds.every((id) => id.startsWith('room:'))).toBe(true)

    const allWallIds = deriveRooms(walls).flatMap((room) => room.wallIds)
    for (const wall of walls) {
      expect(allWallIds).toContain(wall.id)
    }
  })
})

describe('roomKey', () => {
  it('equals the room id with the room: prefix stripped', () => {
    const room = onlyRoom(rectangleEdgesWithIds())

    expect(room.id).toBe(ROOM_ID_PREFIX + roomKey(room))
  })

  it('is stable across two derivations of the same walls', () => {
    const walls = rectangleEdgesWithIds()

    const firstKey = roomKey(onlyRoom(walls))
    const secondKey = roomKey(onlyRoom(walls))

    expect(firstKey).toBe(secondKey)
  })

  it('is independent of the insertion order of the bounding walls', () => {
    const walls = rectangleEdgesWithIds()
    const reordered = [...walls].reverse()

    expect(roomKey(onlyRoom(reordered))).toBe(roomKey(onlyRoom(walls)))
  })
})
