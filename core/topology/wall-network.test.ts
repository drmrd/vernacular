import { describe, expect, it } from 'vitest'
import { pathEnd, pathStart } from '../geometry/wall-path'
import type { Room } from './rooms'
import type { Wall } from '../model/types'
import {
  centeredEllFloor,
  centeredPartitionFloor,
  courtyardFloor,
  flushEllFloor,
  linkedShaftFloor,
  longNorthWallFloor,
  offCenterPartitionFloor,
} from '../scene/wall-runs-test-fixtures'
import { derivePlanRooms } from './floor-plan-geometry'
import {
  networkWallsOf,
  splitTeeWalls,
  squareLoopWalls,
  teeWalls,
  twoRoomWalls,
} from './plan-geometry-test-support'
import { deriveRooms } from './rooms'
import { buildWallGraph } from './wall-graph'
import { deriveWallNetwork } from './wall-network'

const OUTER_LOOP_MAX_MM = 6000
const INNER_LOOP_MIN_MM = 2000
const INNER_LOOP_MAX_MM = 4000
const OUTERMOST_LOOP_MAX_MM = 9000
const MIDDLE_LOOP_MIN_MM = 2000
const MIDDLE_LOOP_MAX_MM = 7000
const INNERMOST_LOOP_MIN_MM = 4000
const INNERMOST_LOOP_MAX_MM = 5000
const SPLIT_TEE_EDGE_COUNT = 3

interface WallCase {
  name: string
  walls: Wall[]
}

const wallCases: WallCase[] = [
  { name: 'a tee', walls: teeWalls() },
  { name: 'a split tee', walls: splitTeeWalls() },
  { name: 'two rooms', walls: twoRoomWalls() },
  { name: 'a long north wall', walls: longNorthWallFloor().walls },
  { name: 'a centered partition', walls: centeredPartitionFloor().walls },
  { name: 'an off-center partition', walls: offCenterPartitionFloor().walls },
  { name: 'a centered ell', walls: centeredEllFloor().walls },
  { name: 'a flush ell', walls: flushEllFloor().walls },
  { name: 'a courtyard', walls: courtyardFloor().walls },
  { name: 'a linked shaft', walls: linkedShaftFloor().walls },
]

function networkOf(walls: readonly Wall[]) {
  return deriveWallNetwork(networkWallsOf(walls))
}

function roomsBySizeDescending(rooms: readonly Room[]): Room[] {
  return [...rooms].sort((a, b) => b.area - a.area)
}

describe('deriveWallNetwork', () => {
  describe.each(wallCases)('on $name', ({ walls }) => {
    it("keeps the junctions of today's wall graph", () => {
      expect(networkOf(walls).junctions).toEqual(buildWallGraph(walls).vertices)
    })

    it("keeps the edges of today's wall graph in their order", () => {
      const { edges } = networkOf(walls)

      expect(edges.map((edge) => ({ a: edge.from, b: edge.to, wallId: edge.wallId }))).toEqual(
        buildWallGraph(walls).edges,
      )
      expect(edges.map((edge) => edge.index)).toEqual(edges.map((_edge, position) => position))
    })

    it('gives each edge the path between its two junctions', () => {
      const { junctions, edges } = networkOf(walls)

      for (const edge of edges) {
        expect(pathStart(edge.path)).toEqual(junctions[edge.from])
        expect(pathEnd(edge.path)).toEqual(junctions[edge.to])
      }
    })

    it('covers no other wall on any edge', () => {
      for (const edge of networkOf(walls).edges) {
        expect(edge.covers).toEqual([])
      }
    })
  })

  it('splits a wall at a tee into two edges of that wall', () => {
    const { edges } = networkOf(splitTeeWalls())

    expect(edges).toHaveLength(SPLIT_TEE_EDGE_COUNT)
    expect(edges.filter((edge) => edge.wallId === 'long')).toHaveLength(2)
  })
})

describe('derivePlanRooms', () => {
  it('gives a loop inside a loop to the outer room as a hole', () => {
    const walls = [
      ...squareLoopWalls(0, OUTER_LOOP_MAX_MM, 'outer'),
      ...squareLoopWalls(INNER_LOOP_MIN_MM, INNER_LOOP_MAX_MM, 'inner'),
    ]

    const rooms = derivePlanRooms(networkOf(walls))

    expect(rooms).toEqual(deriveRooms(walls))
    expect(roomsBySizeDescending(rooms)[0]?.holes).toHaveLength(1)
  })

  it('punches a nested loop into the room directly around it and no other', () => {
    const walls = [
      ...squareLoopWalls(0, OUTERMOST_LOOP_MAX_MM, 'outermost'),
      ...squareLoopWalls(MIDDLE_LOOP_MIN_MM, MIDDLE_LOOP_MAX_MM, 'middle'),
      ...squareLoopWalls(INNERMOST_LOOP_MIN_MM, INNERMOST_LOOP_MAX_MM, 'innermost'),
    ]

    const rooms = derivePlanRooms(networkOf(walls))

    expect(rooms).toEqual(deriveRooms(walls))
    const [outermost, middle] = roomsBySizeDescending(rooms)
    expect(outermost?.holes).toHaveLength(1)
    expect(middle?.holes).toHaveLength(1)
  })

  it('gives no room a hole when rooms sit side by side', () => {
    const rooms = derivePlanRooms(networkOf(twoRoomWalls()))

    expect(rooms).toHaveLength(2)
    expect(rooms.map((room) => room.holes)).toEqual([undefined, undefined])
  })

  it('returns no room for walls that close no loop', () => {
    expect(derivePlanRooms(networkOf(teeWalls()))).toEqual([])
  })

  it('refuses a network that deriveWallNetwork did not build', () => {
    const built = networkOf(twoRoomWalls())
    const lookalike = { ...built }

    expect(lookalike).toEqual(built)
    expect(() => derivePlanRooms(lookalike)).toThrow(Error)
  })
})
