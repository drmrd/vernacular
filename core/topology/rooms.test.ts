import { describe, expect, it } from 'vitest'
import type { Point, RoomOverride, Wall } from '../model/types'
import { createWall, DEFAULT_WALL_THICKNESS_MM } from '../model/factories'
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

function expectCornerSet(polygon: Point[], expectedCorners: Point[]): void {
  expect(polygon).toHaveLength(expectedCorners.length)
  for (const corner of expectedCorners) {
    expect(polygon).toContainEqual(corner)
  }
}

const CENTERLINE_RECTANGLE_CORNERS: Point[] = [
  { x: 0, y: 0 },
  { x: 2000, y: 0 },
  { x: 2000, y: 1000 },
  { x: 0, y: 1000 },
]

function centerlineRectangleWalls(thicknesses: number[]): Wall[] {
  return CENTERLINE_RECTANGLE_CORNERS.map((corner, index) => {
    const next = CENTERLINE_RECTANGLE_CORNERS[(index + 1) % CENTERLINE_RECTANGLE_CORNERS.length]
    const thickness = thicknesses[index]
    if (next === undefined || thickness === undefined) {
      throw new Error('expected a closing corner and a thickness per edge')
    }
    return createWall(corner, next, { thickness })
  })
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
  return soleDerivedRoom(walls)
}

function soleDerivedRoom(walls: Wall[]): Room {
  const [room, ...rest] = deriveRooms(walls)
  if (room === undefined || rest.length > 0) {
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

    const room = soleDerivedRoom(walls)
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

    const room = soleDerivedRoom(walls)
    expect(room.area).toBe((4000 - DEFAULT_WALL_THICKNESS_MM) * (3000 - DEFAULT_WALL_THICKNESS_MM))
  })

  it('excludes a dangling stub wall from the derived room polygon', () => {
    const walls = [
      createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }),
      createWall({ x: 4000, y: 0 }, { x: 4000, y: 3000 }),
      createWall({ x: 4000, y: 3000 }, { x: 0, y: 3000 }),
      createWall({ x: 0, y: 3000 }, { x: 0, y: 0 }),
      createWall({ x: 4000, y: 0 }, { x: 3000, y: 1000 }),
    ]

    const room = soleDerivedRoom(walls)
    expect(room.polygon).toHaveLength(4)
    expect(room.area).toBe((4000 - DEFAULT_WALL_THICKNESS_MM) * (3000 - DEFAULT_WALL_THICKNESS_MM))
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
    const clearCellArea = (3000 - DEFAULT_WALL_THICKNESS_MM) ** 2
    expect(rooms.map((room) => room.area).sort((a, b) => a - b)).toEqual([
      clearCellArea,
      clearCellArea,
    ])
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

describe('deriveRooms thickness-aware clear area', () => {
  it('insets the clear polygon by each wall half-thickness for a uniform-thickness room', () => {
    const walls = centerlineRectangleWalls([200, 200, 200, 200])

    const room = soleDerivedRoom(walls)
    expectCornerSet(room.clearPolygon, [
      { x: 100, y: 100 },
      { x: 1900, y: 100 },
      { x: 1900, y: 900 },
      { x: 100, y: 900 },
    ])
    expect(room.area).toBe(1_440_000)
  })

  it('insets each clear-polygon edge by its own wall half-thickness', () => {
    const walls = centerlineRectangleWalls([400, 200, 200, 200])

    const room = soleDerivedRoom(walls)
    expectCornerSet(room.clearPolygon, [
      { x: 100, y: 200 },
      { x: 1900, y: 200 },
      { x: 1900, y: 900 },
      { x: 100, y: 900 },
    ])
    expect(room.area).toBe(1_260_000)
  })
})

describe('deriveRooms outer (gross) boundary', () => {
  it('outsets the outer polygon by each wall half-thickness for a uniform-thickness room', () => {
    const walls = centerlineRectangleWalls([200, 200, 200, 200])

    const room = soleDerivedRoom(walls)
    expectCornerSet(room.outerPolygon, [
      { x: -100, y: -100 },
      { x: 2100, y: -100 },
      { x: 2100, y: 1100 },
      { x: -100, y: 1100 },
    ])
  })

  it('outsets each outer-polygon edge by its own wall half-thickness', () => {
    const walls = centerlineRectangleWalls([400, 200, 200, 200])

    const room = soleDerivedRoom(walls)
    expectCornerSet(room.outerPolygon, [
      { x: -100, y: -200 },
      { x: 2100, y: -200 },
      { x: 2100, y: 1100 },
      { x: -100, y: 1100 },
    ])
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

  it('sets the clear polygon to the custom polygon with its shoelace area and no inset', () => {
    const room = deriveRectangleRoom()
    const overrides = { [roomKey(room)]: { customPolygon: CUSTOM_POLYGON } }

    const merged = appliedRectangleRoom(overrides)

    expect(merged.clearPolygon).toEqual(CUSTOM_POLYGON)
    expect(merged.area).toBe(Math.abs(polygonArea(CUSTOM_POLYGON)))
  })

  it('sets the outer polygon to the custom polygon for a custom-polygon override', () => {
    const room = deriveRectangleRoom()
    const overrides = { [roomKey(room)]: { customPolygon: CUSTOM_POLYGON } }

    const merged = appliedRectangleRoom(overrides)

    expect(merged.outerPolygon).toEqual(CUSTOM_POLYGON)
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
  it('joins the bounding-wall ids with the pipe separator', () => {
    expect(roomKey({ wallIds: ['w-a', 'w-b'] })).toBe('w-a|w-b')
  })

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
