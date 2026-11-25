import { describe, expect, it } from 'vitest'
import type { Project } from '../model/types'
import { createPlanGeometryDeriver, deriveFloorPlanGeometry } from '../topology/floor-plan-geometry'
import { deriveRooms } from '../topology/rooms'
import { wallNetworkBuildCount, wallNetworkFor } from '../topology/wall-network-memo'
import { deriveSceneGraph } from './scene-graph'
import { twoStoreyProject, withGround } from './scene-graph-parity-fixtures'

const THICKER_BY_MM = 10
const NO_BUILDS = 0
const ONE_BUILD = 1
const BUILT_IN_BRICK_THICKNESS_MM = 231

function groundOf(project: Project) {
  const [ground] = project.floors
  if (ground === undefined) {
    throw new Error('expected a ground floor')
  }
  return ground
}

function withSouthWallThicker(project: Project): Project {
  return withGround(project, (ground) => ({
    ...ground,
    walls: ground.walls.map((wall) =>
      wall.id === 'w-south' ? { ...wall, thickness: wall.thickness + THICKER_BY_MM } : wall,
    ),
  }))
}

function withSouthWallInBrick(project: Project): Project {
  return withGround(project, (ground) => ({
    ...ground,
    walls: ground.walls.map((wall) =>
      wall.id === 'w-south' ? { ...wall, constructionProfile: 'solid-masonry-brick' } : wall,
    ),
  }))
}

describe('createPlanGeometryDeriver', () => {
  it('returns the same plan geometry for the same floor object', () => {
    const derive = createPlanGeometryDeriver()
    const floor = groundOf(twoStoreyProject())

    expect(derive(floor)).toBe(derive(floor))
  })

  it('keeps the wall network and the rooms when only the openings change', () => {
    const derive = createPlanGeometryDeriver()
    const floor = groundOf(twoStoreyProject())
    const before = derive(floor)

    const after = derive({ ...floor, openings: [...floor.openings] })

    expect(after.network).toBe(before.network)
    expect(after.rooms).toBe(before.rooms)
    expect(after.openingSpans).not.toBe(before.openingSpans)
    expect(after.openingSpans).toEqual(before.openingSpans)
  })

  it('keeps the opening spans when neither walls nor openings change', () => {
    const derive = createPlanGeometryDeriver()
    const floor = groundOf(twoStoreyProject())
    const before = derive(floor)

    const after = derive({ ...floor, name: 'x' })

    expect(after.openingSpans).toBe(before.openingSpans)
  })

  it('builds one wall network when one wall of one floor changes', () => {
    const derive = createPlanGeometryDeriver()
    const project = twoStoreyProject()
    project.floors.forEach((floor) => derive(floor))
    const edited = withSouthWallThicker(project)
    const buildsBefore = wallNetworkBuildCount()

    edited.floors.forEach((floor) => derive(floor))

    expect(wallNetworkBuildCount() - buildsBefore).toBe(ONE_BUILD)
  })

  it('builds no wall network for the pure scene graph after the deriver ran', () => {
    const derive = createPlanGeometryDeriver()
    const edited = withSouthWallThicker(twoStoreyProject())
    edited.floors.forEach((floor) => derive(floor))
    const buildsBefore = wallNetworkBuildCount()

    deriveSceneGraph(edited)

    expect(wallNetworkBuildCount() - buildsBefore).toBe(NO_BUILDS)
  })
})

describe('createPlanGeometryDeriver registries', () => {
  it('resolves the thickness of a profiled wall from the built-in registry', () => {
    const derive = createPlanGeometryDeriver()
    const ground = groundOf(withSouthWallInBrick(twoStoreyProject()))

    expect(derive(ground).network.thickness.get('w-south')).toBe(BUILT_IN_BRICK_THICKNESS_MM)
  })
})

describe('deriveFloorPlanGeometry', () => {
  it('reads its wall network through the wall network memo', () => {
    const floor = groundOf(twoStoreyProject())
    const first = deriveFloorPlanGeometry(floor)
    const buildsBefore = wallNetworkBuildCount()

    const second = deriveFloorPlanGeometry(floor)

    expect(second.network).toBe(first.network)
    expect(first.network).toBe(wallNetworkFor(floor.walls))
    expect(wallNetworkBuildCount() - buildsBefore).toBe(NO_BUILDS)
  })
})

describe('deriveRooms', () => {
  it('returns its own array from deriveRooms on every call', () => {
    const { walls } = groundOf(twoStoreyProject())

    const first = deriveRooms(walls)
    const second = deriveRooms(walls)

    expect(second).toEqual(first)
    expect(second).not.toBe(first)
  })
})
