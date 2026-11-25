import { describe, expect, it } from 'vitest'
import { distance } from '../geometry/point'
import { createOpening, createWall } from '../model/factories'
import type { Opening, Point } from '../model/types'
import { counterClockwiseWalls, pt, wall } from '../scene/opening-room-side-test-fixtures'
import { deriveFloorPlanGeometry, deriveOpeningSpans } from './floor-plan-geometry'
import {
  floorOf,
  networkOf,
  splitTeeWalls,
  TEE_ARM_MM,
  twoRoomWalls,
} from './plan-geometry-test-support'
import type { NetworkEdge, WallNetwork } from './wall-network'

const WALL_LENGTH_MM = 4000
const WALL_THICKNESS_MM = 114
const CENTER_MM = 2000
const DOOR_WIDTH_MM = 1000
const SPLIT_POSITION_MM = 3500
const SPLIT_WIDTH_MM = 600
const HALF_SPLIT_WIDTH_MM = SPLIT_WIDTH_MM / 2
const SECOND_WALL_Y_MM = 1000
const SPECK_POSITION_MM = 0.25
const NEAR_START_POSITION_MM = 300
const PAST_END_POSITION_MM = 4200
const FIRST_EDGE_DISTANCE_MM = 1900

function doorOn(id: string, hostWallId: string, position: number): Opening {
  return createOpening({
    id,
    type: 'single-swing-door',
    hostWallId,
    position,
    width: DOOR_WIDTH_MM,
  })
}

function junctionOf(network: WallNetwork, index: number): Point {
  const junction = network.junctions[index]
  if (junction === undefined) {
    throw new Error(`expected a junction ${index}`)
  }
  return junction
}

function edgeOfWall(
  network: WallNetwork,
  wallId: string,
  holds: (from: Point, to: Point) => boolean = () => true,
): NetworkEdge {
  const edge = network.edges.find(
    (candidate) =>
      candidate.wallId === wallId &&
      holds(junctionOf(network, candidate.from), junctionOf(network, candidate.to)),
  )
  if (edge === undefined) {
    throw new Error(`expected an edge of wall ${wallId}`)
  }
  return edge
}

function splitWallDoor(): Opening {
  return createOpening({
    id: 'd',
    type: 'single-swing-door',
    hostWallId: 'long',
    position: SPLIT_POSITION_MM,
    width: SPLIT_WIDTH_MM,
  })
}

describe('deriveOpeningSpans', () => {
  it('gives an opening its span along the edge that holds its center', () => {
    const wall = createWall(
      { x: 0, y: 0 },
      { x: WALL_LENGTH_MM, y: 0 },
      { id: 'w', thickness: WALL_THICKNESS_MM },
    )
    const network = networkOf([wall])

    expect(deriveOpeningSpans(network, [doorOn('d', 'w', CENTER_MM)])).toEqual([
      { openingId: 'd', edgeIndex: 0, fromMm: 1500, toMm: 2500 },
    ])
  })

  it('measures the span from the first junction of its edge on a split wall', () => {
    const network = networkOf(splitTeeWalls())
    const edge = edgeOfWall(
      network,
      'long',
      (from, to) => from.x >= TEE_ARM_MM && to.x >= TEE_ARM_MM,
    )
    const first = junctionOf(network, edge.from)
    const center = { x: SPLIT_POSITION_MM, y: 0 }

    const spans = deriveOpeningSpans(network, [splitWallDoor()])

    const distanceToCenter = distance(first, center)
    expect(spans).toEqual([
      {
        openingId: 'd',
        edgeIndex: edge.index,
        fromMm: distanceToCenter - HALF_SPLIT_WIDTH_MM,
        toMm: distanceToCenter + HALF_SPLIT_WIDTH_MM,
      },
    ])
  })
})

describe('deriveOpeningSpans placement', () => {
  it('moves the center of an opening that overhangs the start of its wall onto the wall', () => {
    const network = networkOf([
      createWall({ x: 0, y: 0 }, { x: WALL_LENGTH_MM, y: 0 }, { id: 'w', thickness: 114 }),
    ])

    const spans = deriveOpeningSpans(network, [doorOn('d', 'w', NEAR_START_POSITION_MM)])

    expect(spans).toEqual([{ openingId: 'd', edgeIndex: 0, fromMm: 0, toMm: DOOR_WIDTH_MM }])
  })

  it('moves the center of an opening that overhangs the end of its wall onto the wall', () => {
    const network = networkOf([
      createWall({ x: 0, y: 0 }, { x: WALL_LENGTH_MM, y: 0 }, { id: 'w', thickness: 114 }),
    ])

    const spans = deriveOpeningSpans(network, [doorOn('d', 'w', PAST_END_POSITION_MM)])

    expect(spans).toEqual([
      {
        openingId: 'd',
        edgeIndex: 0,
        fromMm: WALL_LENGTH_MM - DOOR_WIDTH_MM,
        toMm: WALL_LENGTH_MM,
      },
    ])
  })

  it('does not clip the span to the edge that holds the center', () => {
    const network = networkOf(splitTeeWalls())
    const edge = edgeOfWall(network, 'long', (from) => from.x === 0)
    const center = FIRST_EDGE_DISTANCE_MM
    const opening = createOpening({
      id: 'd',
      type: 'single-swing-door',
      hostWallId: 'long',
      position: center,
      width: SPLIT_WIDTH_MM,
    })

    const spans = deriveOpeningSpans(network, [opening])

    expect(spans).toEqual([
      {
        openingId: 'd',
        edgeIndex: edge.index,
        fromMm: center - HALF_SPLIT_WIDTH_MM,
        toMm: center + HALF_SPLIT_WIDTH_MM,
      },
    ])
  })

  it('gives a center at the junction of a split wall to the first edge', () => {
    const network = networkOf(splitTeeWalls())
    const edge = edgeOfWall(network, 'long', (from) => from.x === 0)
    const opening = createOpening({
      id: 'd',
      type: 'single-swing-door',
      hostWallId: 'long',
      position: TEE_ARM_MM,
      width: SPLIT_WIDTH_MM,
    })

    const spans = deriveOpeningSpans(network, [opening])

    expect(spans).toEqual([
      {
        openingId: 'd',
        edgeIndex: edge.index,
        fromMm: TEE_ARM_MM - HALF_SPLIT_WIDTH_MM,
        toMm: TEE_ARM_MM + HALF_SPLIT_WIDTH_MM,
      },
    ])
  })

  it('puts the span on the edge of the host wall when an earlier wall also holds the center', () => {
    const network = networkOf([
      createWall({ x: 0, y: 0 }, { x: WALL_LENGTH_MM, y: 0 }, { id: 'first', thickness: 114 }),
      createWall(
        { x: 0, y: SECOND_WALL_Y_MM },
        { x: WALL_LENGTH_MM, y: SECOND_WALL_Y_MM },
        { id: 'second', thickness: 114 },
      ),
    ])
    const edge = edgeOfWall(network, 'second')

    const spans = deriveOpeningSpans(network, [doorOn('d', 'second', CENTER_MM)])

    expect(edge.index).toBeGreaterThan(edgeOfWall(network, 'first').index)
    expect(spans).toEqual([{ openingId: 'd', edgeIndex: edge.index, fromMm: 1500, toMm: 2500 }])
  })

  it('keeps the order of the openings', () => {
    const network = networkOf(twoRoomWalls())

    const spans = deriveOpeningSpans(network, [
      doorOn('on-north', 'north', DOOR_WIDTH_MM),
      doorOn('on-south', 'south', CENTER_MM),
    ])

    expect(spans.map((span) => span.openingId)).toEqual(['on-north', 'on-south'])
  })

  it('gives no span to an opening whose host wall is not on the floor', () => {
    const network = networkOf(twoRoomWalls())

    expect(deriveOpeningSpans(network, [doorOn('d', 'missing', CENTER_MM)])).toEqual([])
  })

  it('puts the spans on the plan geometry of a floor', () => {
    const floor = floorOf(splitTeeWalls(), [splitWallDoor()])

    const geometry = deriveFloorPlanGeometry(floor)

    expect(geometry.openingSpans).toHaveLength(1)
    expect(geometry.openingSpans).toEqual(deriveOpeningSpans(geometry.network, floor.openings))
  })

  describe.each([
    { name: 'free of other walls', walls: [wall('speck', pt(2000, 1500), pt(2000.5, 1500))] },
    { name: 'at a corner of two walls', walls: [wall('speck', pt(-0.6, 0), pt(0.6, 0))] },
  ])('a speck wall $name that the geometry sets aside', ({ walls }) => {
    it('gives no span to an opening on it', () => {
      const floor = floorOf(
        [...counterClockwiseWalls(), ...walls],
        [doorOn('d', 'speck', SPECK_POSITION_MM)],
      )

      const geometry = deriveFloorPlanGeometry(floor)

      expect(geometry.setAside.zeroLengthWallIds).toContain('speck')
      expect(geometry.openingSpans).toEqual([])
    })
  })
})
