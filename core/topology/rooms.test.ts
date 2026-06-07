import { describe, expect, it } from 'vitest'
import type { Point, RoomOverride, Wall } from '../model/types'
import { createWall } from '../model/factories'
import { polygonArea } from '../geometry/polygon'
import type { Room } from './rooms'
import { applyRoomOverrides, deriveRooms, ROOM_ID_PREFIX, roomKey } from './rooms'

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
    expect(firstIds.every((id) => id.startsWith(ROOM_ID_PREFIX))).toBe(true)

    const allWallIds = deriveRooms(walls).flatMap((room) => room.wallIds)
    for (const wall of walls) {
      expect(allWallIds).toContain(wall.id)
    }
  })
})

const CUSTOM_POLYGON: Point[] = [
  { x: 0, y: 0 },
  { x: 2000, y: 0 },
  { x: 2000, y: 2000 },
  { x: 0, y: 2000 },
]

const RECTANGLE_NAME = 'Parlor'
const STALE_OVERRIDE_KEY = 'wall-absent-a|wall-absent-b'

function deriveRectangleRoom(): Room {
  const rooms = deriveRooms(rectangleEdgesWithIds())
  const room = rooms[0]
  if (room === undefined || rooms.length !== 1) {
    throw new Error('expected exactly one derived room')
  }
  return room
}

function appliedRectangleRoom(overrides: Record<string, RoomOverride> | undefined): Room {
  const room = deriveRectangleRoom()
  const applied = applyRoomOverrides([room], overrides)
  const result = applied[0]
  if (result === undefined) {
    throw new Error('expected the room to survive the merge')
  }
  return result
}

describe('applyRoomOverrides', () => {
  it('attaches a name-only override while leaving polygon and area unchanged', () => {
    const room = deriveRectangleRoom()
    const overrides = { [roomKey(room)]: { name: RECTANGLE_NAME } }

    const merged = appliedRectangleRoom(overrides)

    expect(merged.name).toBe(RECTANGLE_NAME)
    expect(merged.polygon).toEqual(room.polygon)
    expect(merged.area).toBe(room.area)
  })

  it('replaces the polygon and recomputes a non-negative area for a custom-polygon override', () => {
    const room = deriveRectangleRoom()
    const overrides = { [roomKey(room)]: { customPolygon: CUSTOM_POLYGON } }

    const merged = appliedRectangleRoom(overrides)

    expect(merged.polygon).toEqual(CUSTOM_POLYGON)
    expect(merged.area).toBe(Math.abs(polygonArea(CUSTOM_POLYGON)))
  })

  it('returns a room with no matching override unchanged', () => {
    const room = deriveRectangleRoom()

    const merged = appliedRectangleRoom({})

    expect(merged.id).toBe(room.id)
    expect(merged.wallIds).toEqual(room.wallIds)
    expect(merged.polygon).toEqual(room.polygon)
    expect(merged.area).toBe(room.area)
  })

  it('returns the input rooms unchanged when overrides is undefined', () => {
    const room = deriveRectangleRoom()

    const merged = appliedRectangleRoom(undefined)

    expect(merged.id).toBe(room.id)
    expect(merged.polygon).toEqual(room.polygon)
    expect(merged.area).toBe(room.area)
  })

  it('ignores a stale override key that matches no current room', () => {
    const room = deriveRectangleRoom()
    const overrides = { [STALE_OVERRIDE_KEY]: { name: RECTANGLE_NAME } }

    const merged = applyRoomOverrides([room], overrides)

    expect(merged).toHaveLength(1)
    expect(merged[0]?.name).toBeUndefined()
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
