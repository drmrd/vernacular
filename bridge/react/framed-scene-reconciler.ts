import {
  DEFAULT_COLOR_TEMPERATURE_K,
  FLOOR_NODE_PREFIX,
  frameSceneCamera,
  kelvinToLinearRgb,
  type OpeningSceneNode,
  type RoomSceneNode,
  type SceneGraph,
  type SceneNode,
  type SurfaceTreatment,
  type WallSceneNode,
} from '../../core'
import {
  assembleFloorRoot,
  buildOpeningSubgroup,
  buildRoomSubgroup,
  buildWallSubgroup,
  PaintMaterialProvider,
  sceneBounds,
  type NearWallTarget,
  type SceneRoot,
} from '../../engine'
import { buildFramedScene, type FramedScene } from './framed-scene'

export interface FramedSceneReconciler {
  reconcile(graph: SceneGraph, paint?: Record<string, SurfaceTreatment>): FramedScene
}

/** A built wall sub-group together with the exterior-wall fade targets it owns. */
interface WallBuild {
  group: SceneRoot
  nearWallTargets: NearWallTarget[]
}

/** One entity's built sub-group, kept with the node it was built from for reuse. */
interface SubgroupBuild<Node> {
  node: Node
  group: SceneRoot
}

/**
 * One floor's built scene, held as its individual sub-groups so a later edit can reuse
 * the ones whose entity did not change. The wall sub-group records the wall and hosted-
 * opening nodes it was built from (it is the floor's non-local unit and must rebuild
 * whole when any of them changes); rooms and openings keep one build per entity id.
 */
interface CachedFloorBuild {
  floorNode: SceneNode
  paint: Record<string, SurfaceTreatment>
  wall: WallBuild
  wallNodes: WallSceneNode[]
  wallOpeningNodes: OpeningSceneNode[]
  rooms: Map<string, SubgroupBuild<RoomSceneNode>>
  openings: Map<string, SubgroupBuild<OpeningSceneNode>>
  framed: FramedScene
}

interface FloorEntities {
  walls: WallSceneNode[]
  rooms: RoomSceneNode[]
  openings: OpeningSceneNode[]
}

/** Narrows a scene graph's entity arrays to the active floor's model id. */
function floorEntities(graph: SceneGraph, floorNode: SceneNode): FloorEntities {
  const modelId = floorNode.id.slice(FLOOR_NODE_PREFIX.length)
  return {
    walls: graph.walls.filter((wall) => wall.floorId === modelId),
    rooms: graph.rooms.filter((room) => room.floorId === modelId),
    openings: graph.openings.filter((opening) => opening.floorId === modelId),
  }
}

/** Assembles a floor root from its wall and entity sub-groups, recomputing bounds and pose. */
function frameFloor(floorNode: SceneNode, wall: WallBuild, subgroups: SceneRoot[]): FramedScene {
  const root = assembleFloorRoot(floorNode, [wall.group, ...subgroups])
  const bounds = sceneBounds(root)
  return { root, pose: frameSceneCamera(bounds), bounds, nearWallTargets: wall.nearWallTargets }
}

/** Builds a per-id map of one sub-group build per node, keeping each node for reuse. */
function subgroupMap<Node extends { id: string }>(
  nodes: Node[],
  build: (node: Node) => SceneRoot,
): Map<string, SubgroupBuild<Node>> {
  return new Map(
    nodes.map((node): [string, SubgroupBuild<Node>] => [node.id, { node, group: build(node) }]),
  )
}

/** The wall and hosted-opening nodes a wall sub-group is built from. */
function wallInputs(
  entities: FloorEntities,
): Pick<CachedFloorBuild, 'wallNodes' | 'wallOpeningNodes'> {
  return {
    wallNodes: entities.walls,
    wallOpeningNodes: entities.openings.filter((opening) => opening.hostWallId !== undefined),
  }
}

/** Builds every sub-group of a floor afresh and frames it into a cached build. */
function buildFloorBuild(
  floorNode: SceneNode,
  entities: FloorEntities,
  paint: Record<string, SurfaceTreatment>,
): CachedFloorBuild {
  const materials = new PaintMaterialProvider({
    lightColor: kelvinToLinearRgb(DEFAULT_COLOR_TEMPERATURE_K),
    paint,
  })
  const wall = buildWallSubgroup({ ...entities, materials })
  const rooms = subgroupMap(entities.rooms, (node) => buildRoomSubgroup(node, materials))
  const openings = subgroupMap(entities.openings, (node) => buildOpeningSubgroup(node, materials))
  const framed = frameFloor(floorNode, wall, [
    ...[...rooms.values()].map((build) => build.group),
    ...[...openings.values()].map((build) => build.group),
  ])
  return { floorNode, paint, wall, ...wallInputs(entities), rooms, openings, framed }
}

/**
 * Builds the preview scene for the active floor through the per-entity sub-group builders
 * and caches the build per floor id. When the active floor node and paint references are
 * both unchanged it returns the cached FramedScene with no rebuild and no camera reframe.
 * Otherwise it rebuilds the floor and stores the result. Holding one build per floor lets
 * an earlier floor's build survive reconciling a different floor, so switching back to it
 * is a cache hit. Reuse of the unchanged sub-groups within a rebuilt floor layers on top
 * of this build in the reuse tiers.
 */
export function createFramedSceneReconciler(): FramedSceneReconciler {
  const buildsByFloorId = new Map<string, CachedFloorBuild>()

  return {
    reconcile(graph, paint = {}) {
      const floorNode = graph.nodes[0]
      // No active floor (a transient empty graph): build a throwaway scene without
      // caching, since there is no floor id to key it by.
      if (floorNode === undefined) {
        return buildFramedScene(graph, paint)
      }
      const cached = buildsByFloorId.get(floorNode.id)
      if (cached !== undefined && cached.floorNode === floorNode && cached.paint === paint) {
        return cached.framed
      }
      const build = buildFloorBuild(floorNode, floorEntities(graph, floorNode), paint)
      buildsByFloorId.set(floorNode.id, build)
      return build.framed
    },
  }
}
