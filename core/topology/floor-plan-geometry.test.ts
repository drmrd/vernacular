import { describe, expect, it } from 'vitest'
import { wallPath } from '../geometry/wall-path'
import { createFloor, createWall } from '../model/factories'
import type { Floor, Wall } from '../model/types'
import { createRegistry } from '../registries/registry'
import { effectiveWallThickness } from '../scene/construction-profile'
import { deriveFloorPlanGeometry } from './floor-plan-geometry'

const FLOOR_ID = 'g'
const WALL_ID = 'w'
const WALL_LENGTH_MM = 4000
const RAW_THICKNESS_MM = 114
const UNKNOWN_PROFILE_RAW_THICKNESS_MM = 180
const BRICK_ASSEMBLY_THICKNESS_MM = 231
const CUSTOM_BRICK_THICKNESS_MM = 400
const BRICK_PROFILE = 'solid-masonry-brick'

function floorOf(walls: Wall[]): Floor {
  return createFloor('Ground', { id: FLOOR_ID, walls })
}

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
    const registries = {
      constructionProfiles: createRegistry(1, [
        {
          id: BRICK_PROFILE,
          system: 'solid-masonry' as const,
          layers: [{ material: 'brick', thickness: CUSTOM_BRICK_THICKNESS_MM }],
        },
      ]),
    }

    const { network } = deriveFloorPlanGeometry(floorOf([singleWall(BRICK_PROFILE)]), registries)

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
