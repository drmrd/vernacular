import { describe, expect, it } from 'vitest'
import {
  createSceneGraphDeriver,
  deriveFloorPlanGeometry,
  deriveRoomNodesForFloor,
  deriveSceneGraph,
  sceneGraphForFloor,
  wallNetworkBuildCount,
} from '../index'
import type { FloorPlanGeometry, RoomSceneNode } from '../index'
import type { Project } from '../model/types'
import { twoStoreyProject, withGround } from './scene-graph-parity-fixtures'

const THICKER_BY_MM = 10
const NO_BUILDS = 0
const ONE_BUILD = 1
const GROUND_FLOOR_ID = 'g'
const GROUND_INDEX = 0
const UPPER_INDEX = 1

function withSouthWallThicker(project: Project): Project {
  return withGround(project, (ground) => ({
    ...ground,
    walls: ground.walls.map((wall) =>
      wall.id === 'w-south' ? { ...wall, thickness: wall.thickness + THICKER_BY_MM } : wall,
    ),
  }))
}

function planGeometryOf(graph: { planGeometry?: FloorPlanGeometry[] }): FloorPlanGeometry[] {
  if (graph.planGeometry === undefined) {
    throw new Error('expected the scene graph to carry a plan geometry')
  }
  return graph.planGeometry
}

function shapeOf(room: RoomSceneNode) {
  return {
    id: room.id,
    floorId: room.floorId,
    area: room.area,
    outerPolygon: room.outerPolygon,
    clearPolygon: room.clearPolygon,
  }
}

describe('the plan geometry of the pure scene graph', () => {
  it('carries one plan geometry per floor, in floor order', () => {
    const project = twoStoreyProject()

    expect(deriveSceneGraph(project).planGeometry?.map((geometry) => geometry.floorId)).toEqual(
      project.floors.map((floor) => floor.id),
    )
  })

  it('carries the plan geometry that the floor derives on its own', () => {
    const project = twoStoreyProject()
    const carried = planGeometryOf(deriveSceneGraph(project))

    expect(carried).toHaveLength(project.floors.length)
    project.floors.forEach((floor, index) => {
      expect(carried[index]).toEqual(deriveFloorPlanGeometry(floor))
    })
  })

  it('gives each room node without a custom polygon the area of its plan geometry room', () => {
    const project = twoStoreyProject()
    const graph = deriveSceneGraph(project)

    for (const floor of project.floors) {
      const nodes = graph.rooms.filter((room) => room.floorId === floor.id)
      const geometryRooms = deriveFloorPlanGeometry(floor).rooms

      expect(nodes).toHaveLength(geometryRooms.length)
      for (const node of nodes) {
        expect(node.area).toBe(geometryRooms.find((room) => room.id === node.id)?.area)
      }
    }
  })

  it('gives the room nodes of a floor on its own as the scene graph does', () => {
    const project = twoStoreyProject()
    const graph = deriveSceneGraph(project)

    for (const floor of project.floors) {
      const nodes = deriveRoomNodesForFloor(floor)
      const geometryRooms = deriveFloorPlanGeometry(floor).rooms

      const inGraph = graph.rooms.filter((room) => room.floorId === floor.id)

      expect(nodes.map(shapeOf)).toEqual(inGraph.map(shapeOf))
      for (const node of nodes) {
        expect(node.area).toBe(geometryRooms.find((room) => room.id === node.id)?.area)
      }
    }
  })
})

describe('the plan geometry of the memoized scene graph deriver', () => {
  it('carries the same plan geometry from the memoized deriver', () => {
    const project = twoStoreyProject()

    expect(planGeometryOf(createSceneGraphDeriver()(project))).toStrictEqual(
      planGeometryOf(deriveSceneGraph(project)),
    )
  })

  it('keeps the plan geometry of a floor that an edit did not touch', () => {
    const project = twoStoreyProject()
    const derive = createSceneGraphDeriver()
    const before = planGeometryOf(derive(project))

    const after = planGeometryOf(derive(withSouthWallThicker(project)))

    expect(after[UPPER_INDEX]).toBe(before[UPPER_INDEX])
    expect(after[GROUND_INDEX]).not.toBe(before[GROUND_INDEX])
  })

  it('builds one wall network through the scene graph deriver when one wall changes', () => {
    const project = twoStoreyProject()
    const derive = createSceneGraphDeriver()
    derive(project)
    const edited = withSouthWallThicker(project)
    const buildsBeforeDeriver = wallNetworkBuildCount()

    derive(edited)
    const buildsAfterDeriver = wallNetworkBuildCount()
    deriveSceneGraph(edited)

    expect(buildsAfterDeriver - buildsBeforeDeriver).toBe(ONE_BUILD)
    expect(wallNetworkBuildCount() - buildsAfterDeriver).toBe(NO_BUILDS)
  })
})

describe('the plan geometry of the scene graph of one floor', () => {
  it('keeps only the plan geometry of the floor in the graph of one floor', () => {
    const graph = deriveSceneGraph(twoStoreyProject())

    const ground = sceneGraphForFloor(graph, GROUND_FLOOR_ID)

    expect(ground.planGeometry?.map((geometry) => geometry.floorId)).toEqual([GROUND_FLOOR_ID])
    expect(ground.planGeometry?.[0]).toBe(planGeometryOf(graph)[GROUND_INDEX])
    expect(sceneGraphForFloor(graph, null).planGeometry).toBeUndefined()
  })
})
