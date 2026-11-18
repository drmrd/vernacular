import { describe, expect, it } from 'vitest'
import type { Point } from '../model/types'
import { exteriorWalls, type ExteriorWall } from './exterior-walls'
import type { OpeningSceneNode, RoomSceneNode, WallSceneNode } from './scene-graph'
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
const UNIT_NORMAL_TOLERANCE = 1e-9

type ExpectedRun = readonly [
  wallId: string,
  fromMm: number,
  toMm: number,
  outward: Point,
  openingIds: readonly string[],
]

const NORTH: Point = { x: 0, y: 1 }
const SOUTH: Point = { x: 0, y: -1 }
const EAST: Point = { x: 1, y: 0 }
const WEST: Point = { x: -1, y: 0 }

function expectRuns(actual: readonly ExteriorWall[], expected: readonly ExpectedRun[]) {
  expect(actual.map((run) => run.wallId)).toEqual(expected.map(([wallId]) => wallId))
  expected.forEach(([, fromMm, toMm, outward, openingIds], index) => {
    const run = actual[index]
    expect(Math.abs((run?.fromMm ?? Infinity) - fromMm)).toBeLessThan(EXACT_MM)
    expect(Math.abs((run?.toMm ?? Infinity) - toMm)).toBeLessThan(EXACT_MM)
    expect(Math.abs((run?.outwardNormal.x ?? Infinity) - outward.x)).toBeLessThan(
      UNIT_NORMAL_TOLERANCE,
    )
    expect(Math.abs((run?.outwardNormal.y ?? Infinity) - outward.y)).toBeLessThan(
      UNIT_NORMAL_TOLERANCE,
    )
    expect(run?.openingIds).toEqual(openingIds)
  })
}

function runsOnFloor(floor: Parameters<typeof nodesOf>[0]): ExteriorWall[] {
  const { walls, rooms, openings } = nodesOf(floor)
  return exteriorWalls(walls, rooms, openings)
}

describe('exteriorWalls on a room whose wall runs on past it', () => {
  it('lists the stretch beside the room on the long wall and gives it the door beside the room', () => {
    expectRuns(runsOnFloor(longNorthWallFloor()), [
      ['wall:south', 0, 4000, SOUTH, ['opening:back-door']],
      ['wall:east', 0, 3000, EAST, []],
      ['wall:long-north', 0, 4000, NORTH, ['opening:front-door']],
      ['wall:west', 0, 3000, WEST, []],
    ])
  })

  it('gives no run the window on the part of the long wall that has no room beside it', () => {
    const openingIds = runsOnFloor(longNorthWallFloor()).flatMap((run) => run.openingIds)

    expect(openingIds).not.toContain('opening:far-window')
  })
})

describe('exteriorWalls on a block cut in two by a partition', () => {
  it('lists the long walls over their whole length and no run for the partition', () => {
    expectRuns(runsOnFloor(centeredPartitionFloor()), [
      ['wall:south', 0, 8000, SOUTH, []],
      ['wall:east', 0, 4000, EAST, []],
      ['wall:north', 0, 8000, NORTH, ['opening:north-door']],
      ['wall:west', 0, 4000, WEST, []],
    ])
  })
})

describe('exteriorWalls on a block with an ell on its long wall', () => {
  it('lists two runs of the long wall, one each side of an ell in the middle', () => {
    expectRuns(runsOnFloor(centeredEllFloor()), [
      ['wall:long-south', 0, 3000, SOUTH, ['opening:side-window']],
      ['wall:long-south', 7000, 10000, SOUTH, []],
      ['wall:east', 0, 4000, EAST, []],
      ['wall:north', 0, 10000, NORTH, []],
      ['wall:west', 0, 4000, WEST, []],
      ['wall:ell-west', 0, 3000, WEST, []],
      ['wall:ell-south', 0, 4000, SOUTH, []],
      ['wall:ell-east', 0, 3000, EAST, []],
    ])
  })

  it('lists one run of the long wall past an ell that is flush with its end, without the door inside', () => {
    const { walls, rooms, openings } = nodesOf(flushEllFloor())
    const longWall = exteriorWalls(walls, rooms, openings).filter(
      (run) => run.wallId === 'wall:long-south',
    )

    expectRuns(longWall, [['wall:long-south', 4000, 10000, SOUTH, []]])
  })
})

describe('exteriorWalls on a ring of rooms around a courtyard', () => {
  const OUTER_LENGTH = 10000

  it('lists the four outer walls and none of the courtyard walls', () => {
    expectRuns(runsOnFloor(courtyardFloor()), [
      ['wall:o-s', 0, OUTER_LENGTH, SOUTH, ['opening:street-door']],
      ['wall:o-e', 0, OUTER_LENGTH, EAST, []],
      ['wall:o-n', 0, OUTER_LENGTH, NORTH, []],
      ['wall:o-w', 0, OUTER_LENGTH, WEST, []],
    ])
  })

  it('lists no run for a wall that links the outer wall to the courtyard', () => {
    const wallIds = runsOnFloor(linkedShaftFloor()).map((run) => run.wallId)

    expect(wallIds).toEqual(['wall:o-s', 'wall:o-e', 'wall:o-n', 'wall:o-w'])
  })
})

describe('exteriorWalls with the rooms built by hand', () => {
  const FLOOR_ID = 'g'
  const corner = (x: number, y: number): Point => ({ x, y })
  const outerRing = [corner(0, 0), corner(10000, 0), corner(10000, 10000), corner(0, 10000)]
  const holeRing = [corner(3000, 3000), corner(7000, 3000), corner(7000, 7000), corner(3000, 7000)]
  const ringRoom: RoomSceneNode = {
    id: 'room:ring',
    kind: 'room',
    floorId: FLOOR_ID,
    polygon: outerRing,
    clearPolygon: outerRing,
    area: 1,
    holes: [holeRing],
  }
  const holeSouthWall: WallSceneNode = {
    id: 'wall:hole-south',
    kind: 'wall',
    floorId: FLOOR_ID,
    start: corner(3000, 3000),
    end: corner(7000, 3000),
    thickness: 114,
  }

  it('lists the wall along a hole of the room with the outward normal pointing into the hole', () => {
    expectRuns(exteriorWalls([holeSouthWall], [ringRoom]), [
      ['wall:hole-south', 0, 4000, NORTH, []],
    ])
  })

  it('lists nothing when every room belongs to another floor', () => {
    const { walls, rooms } = nodesOf(longNorthWallFloor())
    const roomsOfAnotherFloor = rooms.map((room) => ({ ...room, floorId: 'other' }))

    expect(exteriorWalls(walls, roomsOfAnotherFloor)).toEqual([])
  })
})

describe('exteriorWalls agrees with the room side of each opening', () => {
  const floors = [
    ['the long north wall floor', longNorthWallFloor],
    ['the centered ell floor', centeredEllFloor],
    ['the flush ell floor', flushEllFloor],
    ['the courtyard floor', courtyardFloor],
  ] as const

  it.each(floors)('on %s, an opening has a room side exactly when a run holds it', (_, floor) => {
    const { walls, rooms, openings } = nodesOf(floor())
    const runs = exteriorWalls(walls, rooms, openings)

    expect(openings.length).toBeGreaterThan(0)
    for (const opening of openings) {
      const holdingRun = runs.find((run) => run.openingIds.includes(opening.id))

      expect(holdingRun !== undefined).toBe(opening.roomSide !== undefined)
    }
  })

  it.each(floors)(
    'on %s, the outward normal of a run faces away from the room side',
    (_, floor) => {
      const { walls, rooms, openings } = nodesOf(floor())
      const runs = exteriorWalls(walls, rooms, openings)

      for (const opening of openings) {
        const holdingRun = runs.find((run) => run.openingIds.includes(opening.id))
        if (holdingRun === undefined) {
          continue
        }
        const dot =
          holdingRun.outwardNormal.x * opening.normal.x +
          holdingRun.outwardNormal.y * opening.normal.y

        if (opening.roomSide === 'positive') {
          expect(dot).toBeLessThan(0)
        } else {
          expect(dot).toBeGreaterThan(0)
        }
      }
    },
  )
})

describe('exteriorWalls with an opening centered on the boundary of two runs', () => {
  const FLOOR_ID = 'g'
  const WALL_LENGTH = 8000
  const BOUNDARY = 4000
  const ROOM_DEPTH = 3000
  const corner = (x: number, y: number): Point => ({ x, y })
  type Span = readonly [from: number, to: number]
  const roomOver = (id: string, [fromX, toX]: Span, [fromY, toY]: Span) => {
    const ring = [corner(fromX, fromY), corner(toX, fromY), corner(toX, toY), corner(fromX, toY)]
    const room: RoomSceneNode = {
      id,
      kind: 'room',
      floorId: FLOOR_ID,
      polygon: ring,
      clearPolygon: ring,
      area: 1,
    }
    return room
  }
  const wall: WallSceneNode = {
    id: 'wall:split',
    kind: 'wall',
    floorId: FLOOR_ID,
    start: corner(0, 0),
    end: corner(WALL_LENGTH, 0),
    thickness: 114,
  }
  const rooms = [
    roomOver('room:above', [0, BOUNDARY], [0, ROOM_DEPTH]),
    roomOver('room:below', [BOUNDARY, WALL_LENGTH], [-ROOM_DEPTH, 0]),
  ]
  const opening: OpeningSceneNode = {
    id: 'opening:on-the-boundary',
    kind: 'opening',
    floorId: FLOOR_ID,
    type: 'single-swing-door',
    center: corner(BOUNDARY, 0),
    along: corner(1, 0),
    normal: corner(0, 1),
    width: 900,
    height: 2032,
    sillHeight: 0,
    hostThickness: 114,
    orientation: { hinge: 'start', facing: 'positive' },
    hostWallId: 'split',
  }

  it('gives the opening to the first of the two runs', () => {
    const runs = exteriorWalls([wall], rooms, [opening])

    expectRuns(runs, [
      ['wall:split', 0, BOUNDARY, SOUTH, ['opening:on-the-boundary']],
      ['wall:split', BOUNDARY, WALL_LENGTH, NORTH, []],
    ])
  })
})
