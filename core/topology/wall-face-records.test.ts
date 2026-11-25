import { describe, expect, it } from 'vitest'
import { leftNormal, shift, subtract, unit } from '../geometry/vector'
import type { Floor, Point } from '../model/types'
import { counterClockwiseWalls, pt, wall } from '../scene/opening-room-side-test-fixtures'
import type { RoomSceneNode, WallSceneNode } from '../scene/scene-graph'
import {
  roomSidesAt,
  type WallRoomSides,
  wallStretches,
  type WallStretch,
} from '../scene/wall-room-sides'
import {
  centeredEllFloor,
  centeredPartitionFloor,
  courtyardFloor,
  flushEllFloor,
  linkedShaftFloor,
  longNorthWallFloor,
  nodesOf,
  offCenterPartitionFloor,
} from '../scene/wall-runs-test-fixtures'
import {
  deriveFloorPlanGeometry,
  type FloorPlanGeometry,
  type WallFaceRecord,
  type WallFaceStretch,
  type WallSide,
} from './floor-plan-geometry'
import { faceOf, floorOf, SIDES, stubRoomWalls, twoRoomWalls } from './plan-geometry-test-support'

type Side = WallSide
type WallFace = WallFaceRecord
type FaceStretch = WallFaceStretch

const PARTITION_X_MM = 4000
const COURTYARD_WALL_IDS = ['c-s', 'c-e', 'c-n', 'c-w']

function onlyStretch(face: WallFace): FaceStretch {
  const [stretch, ...others] = face.stretches
  if (stretch === undefined || others.length > 0) {
    throw new Error(`expected one stretch on the ${face.side} face of ${face.wallId}`)
  }
  return stretch
}

function roomIndexOf(stretch: FaceStretch): number {
  if (stretch.roomIndex === undefined) {
    throw new Error(`expected a room along ${stretch.fromMm} to ${stretch.toMm}`)
  }
  return stretch.roomIndex
}

function xRangeOfRoom(geometry: FloorPlanGeometry, stretch: FaceStretch) {
  const room = geometry.rooms[roomIndexOf(stretch)]
  if (room === undefined) {
    throw new Error(`expected a room at index ${stretch.roomIndex}`)
  }
  const xs = room.polygon.map((corner) => corner.x)
  return { minX: Math.min(...xs), maxX: Math.max(...xs) }
}

describe('the faces of a wall network', () => {
  it('bounds one room on each face of a wall that two rooms share', () => {
    const geometry = deriveFloorPlanGeometry(floorOf(twoRoomWalls()))

    const positive = onlyStretch(faceOf(geometry.network, 'shared', 'positive'))
    const negative = onlyStretch(faceOf(geometry.network, 'shared', 'negative'))

    expect(positive).toMatchObject({ fromMm: 0, toMm: 3000 })
    expect(negative).toMatchObject({ fromMm: 0, toMm: 3000 })
    expect(xRangeOfRoom(geometry, positive).maxX).toBeLessThanOrEqual(PARTITION_X_MM)
    expect(xRangeOfRoom(geometry, negative).minX).toBeGreaterThanOrEqual(PARTITION_X_MM)
    expect(positive.roomIndex).not.toBe(negative.roomIndex)
  })

  it('bounds no room on the outside face of an outside wall', () => {
    const { network } = deriveFloorPlanGeometry(floorOf(twoRoomWalls()))

    const outside = onlyStretch(faceOf(network, 'east', 'negative'))
    const inside = onlyStretch(faceOf(network, 'east', 'positive'))

    expect(outside).toEqual({ fromMm: 0, toMm: 3000, roomIndex: undefined })
    expect(inside).toMatchObject({ fromMm: 0, toMm: 3000 })
    expect(inside.roomIndex).toBeDefined()
  })

  it('cuts a face where the room along it changes and joins it where the room stays', () => {
    const geometry = deriveFloorPlanGeometry(floorOf(twoRoomWalls()))

    const positive = faceOf(geometry.network, 'south', 'positive')
    const negative = faceOf(geometry.network, 'south', 'negative')

    expect(positive.stretches.map(({ fromMm, toMm }) => ({ fromMm, toMm }))).toEqual([
      { fromMm: 0, toMm: 4000 },
      { fromMm: 4000, toMm: 8000 },
    ])
    const [west, east] = positive.stretches
    if (west === undefined || east === undefined) throw new Error('expected two stretches')
    expect(xRangeOfRoom(geometry, west).maxX).toBeLessThanOrEqual(PARTITION_X_MM)
    expect(xRangeOfRoom(geometry, east).minX).toBeGreaterThanOrEqual(PARTITION_X_MM)
    expect(west.roomIndex).not.toBe(east.roomIndex)
    expect(negative.stretches).toEqual([{ fromMm: 0, toMm: 8000, roomIndex: undefined }])
  })

  it('puts the room on the negative face of a wall drawn the other way round', () => {
    const walls = counterClockwiseWalls().map((each) =>
      each.id === 'south' ? wall('south', pt(4000, 0), pt(0, 0)) : each,
    )
    const { network } = deriveFloorPlanGeometry(floorOf(walls))

    const positive = onlyStretch(faceOf(network, 'south', 'positive'))
    const negative = onlyStretch(faceOf(network, 'south', 'negative'))

    expect(positive).toEqual({ fromMm: 0, toMm: 4000, roomIndex: undefined })
    expect(negative).toMatchObject({ fromMm: 0, toMm: 4000 })
    expect(negative.roomIndex).toBeDefined()
  })

  it('bounds no room on either face of a stub inside a room', () => {
    const { network } = deriveFloorPlanGeometry(floorOf(stubRoomWalls()))

    const stubFaces = SIDES.map((side) => faceOf(network, 'stub', side))
    const south = onlyStretch(faceOf(network, 'south', 'positive'))

    expect(stubFaces.map((face) => face.stretches)).toEqual([
      [{ fromMm: 0, toMm: 1000, roomIndex: undefined }],
      [{ fromMm: 0, toMm: 1000, roomIndex: undefined }],
    ])
    expect(south).toMatchObject({ fromMm: 0, toMm: 4000 })
    expect(south.roomIndex).toBeDefined()
  })

  it('bounds the same room on both faces of a wall that links a shaft to the outer walls', () => {
    const { network } = deriveFloorPlanGeometry(linkedShaftFloor())

    const positive = onlyStretch(faceOf(network, 'link', 'positive'))
    const negative = onlyStretch(faceOf(network, 'link', 'negative'))

    expect(positive).toMatchObject({ fromMm: 0, toMm: 3000 })
    expect(positive.roomIndex).toBeDefined()
    expect(negative.roomIndex).toBe(positive.roomIndex)
  })

  it('bounds the room around a courtyard on the outer faces of the courtyard walls', () => {
    const { network } = deriveFloorPlanGeometry(courtyardFloor())

    for (const wallId of COURTYARD_WALL_IDS) {
      const positive = onlyStretch(faceOf(network, wallId, 'positive'))
      const negative = onlyStretch(faceOf(network, wallId, 'negative'))

      expect(positive.roomIndex).toBeDefined()
      expect(negative.roomIndex).toBeDefined()
      expect(positive.roomIndex).not.toBe(negative.roomIndex)
    }
  })
})

interface FloorCase {
  name: string
  floor: Floor
}

const floorCases: FloorCase[] = [
  { name: 'a long north wall', floor: longNorthWallFloor() },
  { name: 'a centered partition', floor: centeredPartitionFloor() },
  { name: 'an off-center partition', floor: offCenterPartitionFloor() },
  { name: 'a centered ell', floor: centeredEllFloor() },
  { name: 'a flush ell', floor: flushEllFloor() },
  { name: 'a courtyard', floor: courtyardFloor() },
  { name: 'a linked shaft', floor: linkedShaftFloor() },
  { name: 'a stub inside a room', floor: floorOf(stubRoomWalls()) },
]

function middleOf(stretch: { fromMm: number; toMm: number }): number {
  return (stretch.fromMm + stretch.toMm) / 2
}

function faceHasRoomAt(face: WallFace, mm: number): boolean {
  return face.stretches.some(
    (stretch) => stretch.fromMm <= mm && mm < stretch.toMm && stretch.roomIndex !== undefined,
  )
}

function sidesIncludeSide(sides: WallRoomSides, side: Side): boolean {
  return sides === side || sides === 'both'
}

function sidesAt(stretches: readonly WallStretch[], mm: number): WallRoomSides {
  return stretches.find((stretch) => stretch.fromMm <= mm && mm < stretch.toMm)?.sides ?? 'neither'
}

function pointAlong(wallNode: WallSceneNode, mm: number): Point {
  return shift(wallNode.start, unit(subtract(wallNode.end, wallNode.start)), mm)
}

interface WallUnderTest {
  wallId: string
  node: WallSceneNode
  stretches: WallStretch[]
  rooms: RoomSceneNode[]
}

function expectWallStretchesHaveFaceRooms(under: WallUnderTest, face: WallFace): void {
  for (const stretch of under.stretches) {
    expect(
      faceHasRoomAt(face, middleOf(stretch)),
      `${under.wallId} ${face.side} at ${stretch.fromMm}`,
    ).toBe(sidesIncludeSide(stretch.sides, face.side))
  }
}

function expectFaceStretchRoomSide(under: WallUnderTest, face: WallFace, stretch: FaceStretch) {
  const mm = middleOf(stretch)
  const room = stretch.roomIndex === undefined ? undefined : under.rooms[stretch.roomIndex]
  expect(
    sidesIncludeSide(sidesAt(under.stretches, mm), face.side),
    `${under.wallId} ${face.side} at ${mm}`,
  ).toBe(stretch.roomIndex !== undefined)
  if (room === undefined) return
  const place = {
    point: pointAlong(under.node, mm),
    normal: leftNormal(under.node.start, under.node.end),
    floorId: under.node.floorId,
  }
  expect([face.side, 'both']).toContain(roomSidesAt(place, [room]))
}

function wallsUnderTest(floor: Floor): WallUnderTest[] {
  const { walls, rooms } = nodesOf(floor)
  return floor.walls.map((each, index) => {
    const node = walls[index]
    if (node === undefined) throw new Error(`expected a node for wall ${each.id}`)
    return { wallId: each.id, node, stretches: wallStretches(node, rooms), rooms }
  })
}

describe('the faces of a wall network next to the room sides of today', () => {
  it.each(floorCases)('agrees with the room sides of today on every wall ($name)', ({ floor }) => {
    const geometry = deriveFloorPlanGeometry(floor)
    const { rooms } = nodesOf(floor)
    expect(geometry.rooms.map((room) => room.id)).toEqual(rooms.map((room) => room.id))

    for (const under of wallsUnderTest(floor)) {
      for (const side of SIDES) {
        const face = faceOf(geometry.network, under.wallId, side)
        expectWallStretchesHaveFaceRooms(under, face)
        face.stretches.forEach((stretch) => expectFaceStretchRoomSide(under, face, stretch))
      }
    }
  })
})

function faceKeysOfRoom(geometry: FloorPlanGeometry, roomIndex: number): string[] {
  return geometry.network.faces
    .filter((face) => face.stretches.some((stretch) => stretch.roomIndex === roomIndex))
    .map((face) => `${face.wallId}:${face.side}`)
}

describe('the faces of each room', () => {
  it.each([
    { name: 'two rooms', floor: floorOf(twoRoomWalls()) },
    { name: 'a courtyard', floor: courtyardFloor() },
  ])('lists for each room the wall faces that bound it ($name)', ({ floor }) => {
    const geometry = deriveFloorPlanGeometry(floor)

    expect(geometry.rooms.length).toBeGreaterThan(1)
    geometry.rooms.forEach((room, roomIndex) => {
      const listed = room.faces.map((face) => `${face.wallId}:${face.side}`)

      expect(listed.length).toBeGreaterThan(0)
      expect([...listed].sort()).toEqual(faceKeysOfRoom(geometry, roomIndex).sort())
    })
  })
})
