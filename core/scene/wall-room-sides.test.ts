import { describe, expect, it } from 'vitest'
import { createFloor } from '../model/factories'
import type { Floor, Point } from '../model/types'
import { counterClockwiseWalls, pt, wall } from './opening-room-side-test-fixtures'
import { deriveRoomNodesForFloor, type RoomSceneNode, type WallSceneNode } from './scene-graph'
import { roomSidesAt, wallStretches, type WallRoomSides, type WallStretch } from './wall-room-sides'
import {
  centeredEllFloor,
  centeredPartitionFloor,
  courtyardFloor,
  flushEllFloor,
  linkedShaftFloor,
  longNorthWallFloor,
  nodesOf,
} from './wall-runs-test-fixtures'

const EXACT_MM = 1e-6
const FLOOR_ID = 'g'

type ExpectedStretch = readonly [fromMm: number, toMm: number, sides: WallRoomSides]

function expectStretches(actual: readonly WallStretch[], expected: readonly ExpectedStretch[]) {
  expect(actual).toHaveLength(expected.length)
  expected.forEach(([fromMm, toMm, sides], index) => {
    expect(Math.abs((actual[index]?.fromMm ?? Infinity) - fromMm)).toBeLessThan(EXACT_MM)
    expect(Math.abs((actual[index]?.toMm ?? Infinity) - toMm)).toBeLessThan(EXACT_MM)
    expect(actual[index]?.sides).toBe(sides)
  })
}

function stretchesOfWall(floor: Floor, rawWallId: string): WallStretch[] {
  const { walls, rooms } = nodesOf(floor)
  const node = walls.find((candidate) => candidate.id === `wall:${rawWallId}`)
  if (node === undefined) {
    throw new Error(`expected the fixture floor to have the wall ${rawWallId}`)
  }
  return wallStretches(node, rooms)
}

function wallNode(id: string, start: Point, end: Point): WallSceneNode {
  return { id, kind: 'wall', floorId: FLOOR_ID, start, end, thickness: 114 }
}

function roomNode(polygon: Point[], holes: Point[][] = []): RoomSceneNode {
  return {
    id: 'room:hand',
    kind: 'room',
    floorId: FLOOR_ID,
    polygon,
    clearPolygon: polygon,
    area: 1,
    holes,
  }
}

describe('wallStretches', () => {
  it('cuts a long wall where its room ends and leaves the rest with no room along it', () => {
    const floor = longNorthWallFloor()

    expectStretches(stretchesOfWall(floor, 'long-north'), [
      [0, 4000, 'negative'],
      [4000, 10000, 'neither'],
    ])
    expectStretches(stretchesOfWall(floor, 'south'), [[0, 4000, 'positive']])
    expectStretches(stretchesOfWall(floor, 'east'), [[0, 3000, 'positive']])
    expectStretches(stretchesOfWall(floor, 'west'), [[0, 3000, 'positive']])
  })

  it('joins the pieces on either side of a tee into one stretch and puts both rooms on the partition', () => {
    const floor = centeredPartitionFloor()

    expectStretches(stretchesOfWall(floor, 'south'), [[0, 8000, 'positive']])
    expectStretches(stretchesOfWall(floor, 'partition'), [[0, 4000, 'both']])
  })

  it('cuts a wall at both ends of an ell that sits in the middle of it', () => {
    expectStretches(stretchesOfWall(centeredEllFloor(), 'long-south'), [
      [0, 3000, 'positive'],
      [3000, 7000, 'both'],
      [7000, 10000, 'positive'],
    ])
  })

  it('cuts a wall once where an ell starts flush with the end of the wall', () => {
    expectStretches(stretchesOfWall(flushEllFloor(), 'long-south'), [
      [0, 4000, 'both'],
      [4000, 10000, 'positive'],
    ])
  })

  it('reports a room on both sides of each courtyard wall and on the inside of each outer wall', () => {
    const floor = courtyardFloor()

    for (const id of ['c-s', 'c-e', 'c-n', 'c-w']) {
      expectStretches(stretchesOfWall(floor, id), [[0, 4000, 'both']])
    }
    for (const id of ['o-s', 'o-e', 'o-n', 'o-w']) {
      expectStretches(stretchesOfWall(floor, id), [[0, 10000, 'positive']])
    }
  })

  it('keeps a linking wall from cutting the outer wall it joins and puts both sides on it', () => {
    const floor = linkedShaftFloor()

    expectStretches(stretchesOfWall(floor, 'o-s'), [[0, 10000, 'positive']])
    expectStretches(stretchesOfWall(floor, 'c-s'), [[0, 4000, 'both']])
    expectStretches(stretchesOfWall(floor, 'link'), [[0, 3000, 'both']])
  })

  it('puts the room on the positive side of a wall that runs along a clockwise room, and flips it for the reversed wall', () => {
    const clockwise = roomNode([pt(0, 0), pt(0, 3000), pt(4000, 3000), pt(4000, 0)])

    expectStretches(wallStretches(wallNode('wall:s', pt(0, 0), pt(4000, 0)), [clockwise]), [
      [0, 4000, 'positive'],
    ])
    expectStretches(wallStretches(wallNode('wall:s', pt(4000, 0), pt(0, 0)), [clockwise]), [
      [0, 4000, 'negative'],
    ])
  })

  it('puts the room outside a hole on the side of a wall that runs along the hole', () => {
    const outer = [pt(0, 0), pt(10000, 0), pt(10000, 10000), pt(0, 10000)]
    const hole = [pt(3000, 3000), pt(7000, 3000), pt(7000, 7000), pt(3000, 7000)]
    const room = roomNode(outer, [hole])

    expectStretches(wallStretches(wallNode('wall:h', pt(3000, 3000), pt(7000, 3000)), [room]), [
      [0, 4000, 'negative'],
    ])
  })

  it('ignores the rooms of another floor', () => {
    const rooms = nodesOf(longNorthWallFloor()).rooms.map((room) => ({ ...room, floorId: 'other' }))

    expectStretches(wallStretches(wallNode('wall:south', pt(0, 0), pt(4000, 0)), rooms), [
      [0, 4000, 'neither'],
    ])
  })

  it('gives a dangling stub no room and leaves the wall it hangs from whole', () => {
    const walls = [...counterClockwiseWalls(), wall('stub', pt(2000, 0), pt(2000, 1000))]
    const floor = createFloor('Ground', { id: FLOOR_ID, walls })

    expectStretches(stretchesOfWall(floor, 'stub'), [[0, 1000, 'neither']])
    expectStretches(stretchesOfWall(floor, 'south'), [[0, 4000, 'positive']])
  })

  it('counts a wall within a millimeter of a room boundary as along it and a wall two millimeters off as not', () => {
    const { rooms } = nodesOf(longNorthWallFloor())

    expectStretches(wallStretches(wallNode('wall:near', pt(0, 0.5), pt(4000, 0.5)), rooms), [
      [0, 4000, 'positive'],
    ])
    expectStretches(wallStretches(wallNode('wall:far', pt(0, 2), pt(4000, 2)), rooms), [
      [0, 4000, 'neither'],
    ])
  })

  it('gives a wall of no length no stretches', () => {
    const { rooms } = nodesOf(longNorthWallFloor())

    expect(wallStretches(wallNode('wall:point', pt(1000, 0), pt(1000, 0)), rooms)).toEqual([])
  })
})

describe('roomSidesAt', () => {
  const rooms = deriveRoomNodesForFloor(longNorthWallFloor())

  it('names the side with a room along it, or neither past the end of the room', () => {
    const up = pt(0, 1)

    expect(roomSidesAt({ point: pt(2000, 3000), normal: up, floorId: FLOOR_ID }, rooms)).toBe(
      'negative',
    )
    expect(roomSidesAt({ point: pt(7000, 3000), normal: up, floorId: FLOOR_ID }, rooms)).toBe(
      'neither',
    )
  })

  it('reads the sides against the normal it is given', () => {
    const place = { point: pt(2000, 3000), normal: pt(0, -1), floorId: FLOOR_ID }

    expect(roomSidesAt(place, rooms)).toBe('positive')
  })
})
