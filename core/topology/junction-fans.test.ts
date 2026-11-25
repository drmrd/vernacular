import { describe, expect, it } from 'vitest'
import {
  createReferenceProject,
  REFERENCE_FLOOR_COUNT,
} from '../../tests/performance/reference-project'
import type { Point, Wall } from '../model/types'
import { effectiveWallThickness } from '../scene/construction-profile'
import { counterClockwiseWalls, pt, wall, withWall } from '../scene/opening-room-side-test-fixtures'
import {
  centeredEllFloor,
  centeredPartitionFloor,
  courtyardFloor,
  flushEllFloor,
  linkedShaftFloor,
  longNorthWallFloor,
  offCenterPartitionFloor,
} from '../scene/wall-runs-test-fixtures'
import { deriveFloorPlanGeometry } from './floor-plan-geometry'
import { junctionFanBuildCount, junctionFans, vertexIncidence } from './junction-fans'
import { junctionFills } from './junction-fill'
import {
  floorOf,
  networkWallsOf,
  splitTeeWalls,
  teeWalls,
  twoRoomWalls,
} from './plan-geometry-test-support'
import { deriveRooms } from './rooms'
import { wallFootprints } from './wall-footprint'
import { buildWallGraph } from './wall-graph'
import { deriveWallNetwork, type WallNetwork } from './wall-network'

const TEE_POINT: Point = { x: 2000, y: 0 }
const TEE_STEM_END: Point = { x: 2000, y: 1500 }
const LONG_WALL_END: Point = { x: 4000, y: 0 }
const LONG_WALL_START: Point = { x: 0, y: 0 }
const BRICK_PROFILE = 'solid-masonry-brick'

interface WallCase {
  name: string
  walls: Wall[]
}

function firstReferenceFloorWalls(): Wall[] {
  const floor = createReferenceProject().floors[0]
  if (floor === undefined) {
    throw new Error('expected the reference project to have a floor')
  }
  return floor.walls
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
  { name: 'the first reference floor', walls: firstReferenceFloorWalls() },
  {
    name: 'a room with one brick wall',
    walls: withWall(counterClockwiseWalls(), 'south', { constructionProfile: BRICK_PROFILE }),
  },
]

function networkOf(walls: readonly Wall[]): WallNetwork {
  return deriveWallNetwork(networkWallsOf(walls))
}

function junctionAt(network: WallNetwork, point: Point): number {
  const index = network.junctions.findIndex(({ x, y }) => x === point.x && y === point.y)
  if (index < 0) {
    throw new Error(`expected a junction at ${JSON.stringify(point)}`)
  }
  return index
}

function fanAt(network: WallNetwork, point: Point): readonly number[] {
  const fan = network.fans.get(junctionAt(network, point))
  if (fan === undefined) {
    throw new Error(`expected a fan at ${JSON.stringify(point)}`)
  }
  return fan
}

function edgeAt(network: WallNetwork, edgeIndex: number) {
  const edge = network.edges[edgeIndex]
  if (edge === undefined) {
    throw new Error(`expected an edge ${edgeIndex}`)
  }
  return edge
}

function edgesAtJunction(network: WallNetwork, junction: number): number {
  return network.edges.filter((edge) => edge.from === junction || edge.to === junction).length
}

function todaysGraphAndThickness(walls: readonly Wall[]) {
  const graph = buildWallGraph(walls)
  const wallsById = new Map(walls.map((wall) => [wall.id, wall]))
  const thicknessByEdge = graph.edges.map((edge) => {
    const wall = wallsById.get(edge.wallId)
    if (wall === undefined) {
      throw new Error(`expected a wall ${edge.wallId}`)
    }
    return effectiveWallThickness(wall)
  })
  return { graph, thicknessByEdge }
}

describe('the fans of a wall network', () => {
  it('lists the three edges of a tee counterclockwise', () => {
    const network = networkOf(teeWalls())

    const wallIds = fanAt(network, TEE_POINT).map((edgeIndex) => edgeAt(network, edgeIndex).wallId)

    expect(wallIds).toEqual(['b', 'c', 'a'])
  })

  it('lists both pieces of a split wall in the fan of the tee', () => {
    const network = networkOf(splitTeeWalls())
    const junction = junctionAt(network, TEE_POINT)

    const farEnds = fanAt(network, TEE_POINT).map((edgeIndex) => {
      const edge = edgeAt(network, edgeIndex)
      return network.junctions[edge.from === junction ? edge.to : edge.from]
    })

    expect(farEnds).toEqual([LONG_WALL_END, TEE_STEM_END, LONG_WALL_START])
  })

  it('gives every junction that has an edge a fan', () => {
    const network = networkOf(twoRoomWalls())

    const junctionsWithAFan = [...network.fans.keys()].sort((a, b) => a - b)

    expect(junctionsWithAFan).toEqual(network.junctions.map((_junction, index) => index))
    for (const [junction, fan] of network.fans) {
      expect(fan).toHaveLength(edgesAtJunction(network, junction))
    }
  })

  describe.each(wallCases)('on $name', ({ walls }) => {
    it('gives the footprints of today for every edge', () => {
      const { graph, thicknessByEdge } = todaysGraphAndThickness(walls)

      expect(networkOf(walls).footprints).toEqual(wallFootprints(graph, thicknessByEdge))
    })

    it('gives the junction fills of today', () => {
      const { graph, thicknessByEdge } = todaysGraphAndThickness(walls)

      expect(networkOf(walls).fills).toEqual(junctionFills(graph, thicknessByEdge))
    })
  })
})

describe('how often the fans are computed', () => {
  it('computes the fans once for one wall network', () => {
    const before = junctionFanBuildCount()

    networkOf(twoRoomWalls())

    expect(junctionFanBuildCount() - before).toBe(1)
  })

  it('computes the fans once for each floor of the reference project', () => {
    const { floors } = createReferenceProject()
    const before = junctionFanBuildCount()

    for (const floor of floors) {
      deriveFloorPlanGeometry(floor)
    }

    expect(junctionFanBuildCount() - before).toBe(REFERENCE_FLOOR_COUNT)
  })
})

describe('a wall whose two ends merge into one junction', () => {
  const speckWalls = [...counterClockwiseWalls(), wall('speck', pt(-0.6, 0), pt(0.6, 0))]

  function speckEdgeIndex(graph: ReturnType<typeof buildWallGraph>): number {
    const index = graph.edges.findIndex((edge) => edge.a === edge.b)
    expect(index, 'the graph holds an edge from a junction to itself').toBeGreaterThanOrEqual(0)
    return index
  }

  it('lists an edge from a junction to itself once among the edges of its junction', () => {
    const graph = buildWallGraph(speckWalls)
    const index = speckEdgeIndex(graph)
    const junction = (graph.edges[index] as { a: number }).a

    const edgesAtJunction = vertexIncidence(graph).get(junction) ?? []

    expect(edgesAtJunction.filter((edgeIndex) => edgeIndex === index)).toEqual([index])
  })

  it('leaves an edge from a junction to itself out of the fan of its junction', () => {
    const graph = buildWallGraph(speckWalls)
    const index = speckEdgeIndex(graph)
    const junction = (graph.edges[index] as { a: number }).a

    expect(junctionFans(graph).get(junction)).not.toContain(index)
  })

  it('gives the other walls their room when both ends of one wall merge into one junction', () => {
    const geometry = deriveFloorPlanGeometry(floorOf(speckWalls))

    expect(geometry.rooms.map((room) => room.wallIds)).toEqual([['east', 'north', 'south', 'west']])
    expect(geometry.setAside.zeroLengthWallIds).toEqual(['speck'])
    expect(deriveRooms(speckWalls)).toHaveLength(1)
  })
})
