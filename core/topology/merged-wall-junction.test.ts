import { describe, expect, it } from 'vitest'
import type { Point, Wall } from '../model/types'
import { counterClockwiseWalls, pt, wall } from '../scene/opening-room-side-test-fixtures'
import { deriveFloorPlanGeometry } from './floor-plan-geometry'
import { junctionFans, vertexIncidence } from './junction-fans'
import { floorOf, networkOf, todaysGraphAndThickness } from './plan-geometry-test-support'
import { deriveRooms } from './rooms'
import { type WallFootprint, wallFootprints } from './wall-footprint'
import { buildWallGraph } from './wall-graph'
import type { WallNetwork } from './wall-network'

interface SpeckCase {
  name: string
  walls: Wall[]
}

const SPECK_WALL_THICKNESS_MM = 600

function thickened(walls: Wall[]): Wall[] {
  return walls.map((each) => ({ ...each, thickness: SPECK_WALL_THICKNESS_MM }))
}

function speckAtCorner(): Wall[] {
  return [...counterClockwiseWalls(), wall('speck', pt(-0.6, 0), pt(0.6, 0))]
}

const speckCases: SpeckCase[] = [
  { name: 'at a corner of two walls', walls: speckAtCorner() },
  {
    name: 'at a junction of three walls',
    walls: [...speckAtCorner(), wall('stub', pt(0, 0), pt(-1500, -1500))],
  },
  { name: 'with 600 mm walls', walls: thickened(speckAtCorner()) },
]

function footprintCorners(footprint: WallFootprint | undefined): Point[] {
  if (footprint === undefined) {
    throw new Error('expected a footprint')
  }
  return [footprint.aPlus, footprint.aMinus, footprint.bPlus, footprint.bMinus]
}

function footprintArea(footprint: WallFootprint | undefined): number {
  const corners = footprintCorners(footprint)
  const ring = [...corners.slice(0, 2), ...corners.slice(2).reverse()]
  const doubled = ring.reduce((sum, corner, index) => {
    const next = ring[(index + 1) % ring.length] ?? corner
    return sum + corner.x * next.y - next.x * corner.y
  }, 0)
  return Math.abs(doubled) / 2
}

function footprintsByWallId(network: WallNetwork, excludedWallId: string) {
  return new Map(
    network.edges.flatMap((edge, index) =>
      edge.wallId === excludedWallId ? [] : [[edge.wallId, network.footprints[index]] as const],
    ),
  )
}

describe('a wall whose two ends merge into one junction', () => {
  function speckEdge(graph: ReturnType<typeof buildWallGraph>): {
    index: number
    junction: number
  } {
    const index = graph.edges.findIndex((edge) => edge.a === edge.b)
    const edge = graph.edges[index]
    if (edge === undefined) {
      throw new Error('expected the graph to hold an edge from a junction to itself')
    }
    return { index, junction: edge.a }
  }

  describe.each(speckCases)('$name', ({ walls }) => {
    it('lists an edge from a junction to itself once among the edges of its junction', () => {
      const graph = buildWallGraph(walls)
      const { index, junction } = speckEdge(graph)

      const edgesAtJunction = vertexIncidence(graph).get(junction) ?? []

      expect(edgesAtJunction.filter((edgeIndex) => edgeIndex === index)).toEqual([index])
    })

    it('leaves an edge from a junction to itself out of the fan of its junction', () => {
      const graph = buildWallGraph(walls)
      const { index, junction } = speckEdge(graph)

      expect(junctionFans(graph).get(junction)).not.toContain(index)
    })

    it('leaves an edge from a junction to itself out of every junction fill', () => {
      const { index } = speckEdge(buildWallGraph(walls))

      const filledEdges = networkOf(walls).fills.flatMap((fill) => fill.edgeIndexes)

      expect(filledEdges).not.toContain(index)
    })

    it('sets the wall aside and gives the other walls their room when both ends merge into one junction', () => {
      const geometry = deriveFloorPlanGeometry(floorOf(walls))

      expect(geometry.rooms).toHaveLength(1)
      expect(geometry.setAside.zeroLengthWallIds).toEqual(['speck'])
      expect(deriveRooms(walls)).toHaveLength(1)
    })

    it('gives an edge from a junction to itself a footprint with every corner at its junction', () => {
      const network = networkOf(walls)
      const { index, junction } = speckEdge(buildWallGraph(walls))
      const junctionPoint = network.junctions[junction]

      expect(footprintCorners(network.footprints[index])).toEqual(Array(4).fill(junctionPoint))
    })

    it('gives an edge from a junction to itself a footprint at its junction from the graph alone', () => {
      const { graph, thicknessByEdge } = todaysGraphAndThickness(walls)
      const { index, junction } = speckEdge(graph)

      const footprints = wallFootprints(graph, thicknessByEdge)

      expect(footprintCorners(footprints[index])).toEqual(Array(4).fill(graph.vertices[junction]))
    })

    it('leaves the footprints of the other walls as they are without the wall', () => {
      const withoutSpeck = walls.filter((each) => each.id !== 'speck')

      const otherFootprints = footprintsByWallId(networkOf(walls), 'speck')

      expect(otherFootprints).toEqual(footprintsByWallId(networkOf(withoutSpeck), 'speck'))
      expect(otherFootprints.size).toBeGreaterThan(0)
      for (const footprint of otherFootprints.values()) {
        expect(footprintArea(footprint)).toBeGreaterThan(0)
      }
    })
  })

  it('names the walls around the room when both ends of one wall merge into one junction', () => {
    const geometry = deriveFloorPlanGeometry(floorOf(speckAtCorner()))

    expect(geometry.rooms.map((room) => room.wallIds)).toEqual([['east', 'north', 'south', 'west']])
  })
})
