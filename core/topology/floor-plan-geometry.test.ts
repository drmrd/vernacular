import { describe, expect, it } from 'vitest'
import { wallPath } from '../geometry/wall-path'
import { DEFAULT_JUNCTION_TOLERANCE_MM } from '../geometry/tolerance'
import { createWall } from '../model/factories'
import type { Point, Wall } from '../model/types'
import { effectiveWallThickness } from '../scene/construction-profile'
import { deriveFloorPlanGeometry } from './floor-plan-geometry'
import {
  BRICK_PROFILE,
  brickRegistries,
  brickSquareWalls,
  CUSTOM_BRICK_THICKNESS_MM,
  floorOf,
  twoRoomWalls,
} from './plan-geometry-test-support'

const FLOOR_ID = 'g'
const WALL_ID = 'w'
const WALL_LENGTH_MM = 4000
const RAW_THICKNESS_MM = 114
const UNKNOWN_PROFILE_RAW_THICKNESS_MM = 180
const BRICK_ASSEMBLY_THICKNESS_MM = 231
const DOT_POSITION_MM = 1000
const SQUARE_SIDE_MM = 5000

function singleWall(constructionProfile?: string, thickness = RAW_THICKNESS_MM): Wall {
  const wall = createWall({ x: 0, y: 0 }, { x: WALL_LENGTH_MM, y: 0 }, { id: WALL_ID, thickness })
  return constructionProfile === undefined ? wall : { ...wall, constructionProfile }
}

function thicknessesOfOnlyWall(wall: Wall): {
  onWall: number | undefined
  inMap: number | undefined
} {
  const { network } = deriveFloorPlanGeometry(floorOf([wall]))
  return { onWall: network.walls[0]?.thickness, inMap: network.thickness.get(WALL_ID) }
}

describe('deriveFloorPlanGeometry', () => {
  it('carries the id of its floor', () => {
    expect(deriveFloorPlanGeometry(floorOf([singleWall()])).floorId).toBe(FLOOR_ID)
  })

  it('gives each wall the path of its two ends', () => {
    const wall = singleWall()

    const { network } = deriveFloorPlanGeometry(floorOf([wall]))

    expect(network.walls[0]?.id).toBe(WALL_ID)
    expect(network.walls[0]?.path).toEqual(wallPath(wall))
  })

  it('gives a wall of a construction profile the thickness of its assembly', () => {
    const wall = singleWall(BRICK_PROFILE)

    const { onWall, inMap } = thicknessesOfOnlyWall(wall)

    expect(effectiveWallThickness(wall)).toBe(BRICK_ASSEMBLY_THICKNESS_MM)
    expect(onWall).toBe(effectiveWallThickness(wall))
    expect(onWall).toBe(BRICK_ASSEMBLY_THICKNESS_MM)
    expect(inMap).toBe(BRICK_ASSEMBLY_THICKNESS_MM)
  })

  it('keeps the raw thickness of a wall with no profile', () => {
    const { onWall, inMap } = thicknessesOfOnlyWall(singleWall())

    expect(onWall).toBe(RAW_THICKNESS_MM)
    expect(inMap).toBe(RAW_THICKNESS_MM)
  })

  it('keeps the raw thickness of a wall with an unknown profile', () => {
    const wall = singleWall('no-such-profile', UNKNOWN_PROFILE_RAW_THICKNESS_MM)

    const { onWall, inMap } = thicknessesOfOnlyWall(wall)

    expect(onWall).toBe(UNKNOWN_PROFILE_RAW_THICKNESS_MM)
    expect(inMap).toBe(UNKNOWN_PROFILE_RAW_THICKNESS_MM)
  })

  it('resolves the thickness in the registries it is given', () => {
    const { network } = deriveFloorPlanGeometry(
      floorOf([singleWall(BRICK_PROFILE)]),
      brickRegistries(),
    )

    expect(network.walls[0]?.thickness).toBe(CUSTOM_BRICK_THICKNESS_MM)
    expect(network.thickness.get(WALL_ID)).toBe(CUSTOM_BRICK_THICKNESS_MM)
  })

  it('lists every wall of the floor in the order of the floor', () => {
    const rowsByIdInFloorOrder = [
      ['north', 1],
      ['east', 0],
      ['south', 2],
    ] as const
    const walls = rowsByIdInFloorOrder.map(([id, row]) =>
      createWall(
        { x: 0, y: row * WALL_LENGTH_MM },
        { x: WALL_LENGTH_MM, y: row * WALL_LENGTH_MM },
        { id, thickness: RAW_THICKNESS_MM },
      ),
    )

    const { network } = deriveFloorPlanGeometry(floorOf(walls))

    expect(network.walls.map((wall) => wall.id)).toEqual(walls.map((wall) => wall.id))
  })
})

describe('what the plan geometry sets aside', () => {
  const dotPoint = { x: DOT_POSITION_MM, y: DOT_POSITION_MM }

  it('lists a wall of no length as set aside', () => {
    const dot = createWall(dotPoint, dotPoint, { id: 'dot' })

    const { setAside } = deriveFloorPlanGeometry(floorOf([...twoRoomWalls(), dot]))

    expect(setAside.zeroLengthWallIds).toEqual(['dot'])
    expect(setAside.coveredWallIds).toEqual([])
    expect(setAside.unboundRecordIds).toEqual([])
  })

  it('lists a wall shorter than the join distance as set aside', () => {
    const speck = createWall(
      dotPoint,
      { x: DOT_POSITION_MM + DEFAULT_JUNCTION_TOLERANCE_MM / 2, y: DOT_POSITION_MM },
      { id: 'speck' },
    )

    const { setAside } = deriveFloorPlanGeometry(floorOf([...twoRoomWalls(), speck]))

    expect(setAside.zeroLengthWallIds).toEqual(['speck'])
  })

  it('sets nothing aside on a plain floor', () => {
    const { setAside } = deriveFloorPlanGeometry(floorOf(twoRoomWalls()))

    expect(setAside).toEqual({ zeroLengthWallIds: [], coveredWallIds: [], unboundRecordIds: [] })
  })
})

function expectCornersAmong(polygon: readonly Point[], low: number, high: number): void {
  for (const corner of polygon) {
    for (const coordinate of [corner.x, corner.y]) {
      expect(Math.min(Math.abs(coordinate - low), Math.abs(coordinate - high))).toBeCloseTo(0)
    }
  }
}

describe('rooms of profile walls', () => {
  it('measures a room of brick walls between the drawn faces', () => {
    const { rooms } = deriveFloorPlanGeometry(floorOf(brickSquareWalls()))

    const clearSide = SQUARE_SIDE_MM - BRICK_ASSEMBLY_THICKNESS_MM
    expect(rooms).toHaveLength(1)
    expect(rooms[0]?.area).toBeCloseTo(clearSide * clearSide)
    expectCornersAmong(
      rooms[0]?.clearPolygon ?? [],
      BRICK_ASSEMBLY_THICKNESS_MM / 2,
      SQUARE_SIDE_MM - BRICK_ASSEMBLY_THICKNESS_MM / 2,
    )
  })

  it('measures the room between the faces that the given registries resolve', () => {
    const { rooms } = deriveFloorPlanGeometry(floorOf(brickSquareWalls()), brickRegistries())

    const clearSide = SQUARE_SIDE_MM - CUSTOM_BRICK_THICKNESS_MM
    const halfThickness = CUSTOM_BRICK_THICKNESS_MM / 2
    expect(rooms).toHaveLength(1)
    expect(rooms[0]?.area).toBeCloseTo(clearSide * clearSide)
    expectCornersAmong(rooms[0]?.clearPolygon ?? [], halfThickness, SQUARE_SIDE_MM - halfThickness)
    expectCornersAmong(rooms[0]?.outerPolygon ?? [], -halfThickness, SQUARE_SIDE_MM + halfThickness)
  })

  it('keeps a room of plain walls on the raw thickness', () => {
    const floor = floorOf(twoRoomWalls())

    const plain = deriveFloorPlanGeometry(floor).rooms

    expect(plain).not.toHaveLength(0)
    expect(deriveFloorPlanGeometry(floor, brickRegistries()).rooms).toEqual(plain)
  })
})
