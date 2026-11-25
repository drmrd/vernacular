import { resolveGradeElevation } from '../model/site'
import type { Floor, FurnitureInstance, Project, Wall } from '../model/types'
import type { FloorPlanGeometry } from '../topology/floor-plan-geometry'
import type {
  DimensionSceneNode,
  FurnitureSceneNode,
  OpeningSceneNode,
  RoomSceneNode,
  SceneGraph,
  SceneNode,
  StairSceneNode,
  UnderlaySceneNode,
  WallSceneNode,
} from './scene-graph'

/**
 * How the scene graph derives each kind of node. The pure projection supplies one
 * function per kind; the memoized deriver replaces members with cached ones.
 */
export interface SceneNodeDerivations {
  readonly floorNode: (floor: Floor) => SceneNode
  readonly wallNode: (floor: Floor, wall: Wall) => WallSceneNode
  readonly planGeometry: (floor: Floor) => FloorPlanGeometry
  readonly roomNodes: (
    floor: Floor,
    geometry: FloorPlanGeometry,
    overrides: Project['roomOverrides'],
  ) => RoomSceneNode[]
  readonly underlayNodes: (floor: Floor) => UnderlaySceneNode[]
  readonly openingNodes: (
    floor: Floor,
    rooms: readonly RoomSceneNode[],
    geometry: FloorPlanGeometry,
  ) => OpeningSceneNode[]
  readonly dimensionNodes: (floor: Floor) => DimensionSceneNode[]
  readonly stairNodes: (project: Project) => StairSceneNode[]
  readonly furnitureNode: (floor: Floor, item: FurnitureInstance) => FurnitureSceneNode
}

/**
 * Assembles a scene graph from a project with the given derivations. This is the
 * one place that lists the fields of a `SceneGraph`; both the pure projection and
 * the memoized deriver call it. Each member is called through an arrow so the
 * array index of `map` never reaches a derivation as a second argument.
 */
export function assembleSceneGraph(project: Project, derive: SceneNodeDerivations): SceneGraph {
  const floorsWithGeometry = project.floors.map((floor) => ({
    floor,
    geometry: derive.planGeometry(floor),
  }))
  const roomsByFloor = floorsWithGeometry.map(({ floor, geometry }) =>
    derive.roomNodes(floor, geometry, project.roomOverrides),
  )
  return {
    nodes: project.floors.map((floor) => derive.floorNode(floor)),
    walls: project.floors.flatMap((floor) =>
      floor.walls.map((wall) => derive.wallNode(floor, wall)),
    ),
    rooms: roomsByFloor.flat(),
    underlays: project.floors.flatMap((floor) => derive.underlayNodes(floor)),
    openings: floorsWithGeometry.flatMap(({ floor, geometry }, index) =>
      derive.openingNodes(floor, roomsByFloor[index] ?? [], geometry),
    ),
    dimensions: project.floors.flatMap((floor) => derive.dimensionNodes(floor)),
    stairs: derive.stairNodes(project),
    furniture: project.floors.flatMap((floor) =>
      floor.furniture.map((item) => derive.furnitureNode(floor, item)),
    ),
    gradeElevation: resolveGradeElevation(project.site),
    planGeometry: floorsWithGeometry.map(({ geometry }) => geometry),
  }
}
