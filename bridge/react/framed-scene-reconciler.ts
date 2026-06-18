import {
  DEFAULT_COLOR_TEMPERATURE_K,
  FLOOR_NODE_PREFIX,
  frameSceneCamera,
  kelvinToLinearRgb,
  type FurnitureSceneNode,
  type OpeningSceneNode,
  type RoomSceneNode,
  type SceneGraph,
  type SceneNode,
  type SurfaceTreatment,
  type WallSceneNode,
} from '../../core'
import {
  assembleFloorRoot,
  buildFurnitureModelGroup,
  buildFurnitureSubgroup,
  buildOpeningSubgroup,
  buildRoomSubgroup,
  buildWallSubgroup,
  PaintMaterialProvider,
  sceneBounds,
  type NearWallTarget,
  type SceneRoot,
} from '../../engine'
import { buildFramedScene, type FramedScene } from './framed-scene'
import { roomSceneNodeEqual } from './room-scene-node-equal'

type PaintMaterials = InstanceType<typeof PaintMaterialProvider>

type FurnitureModel = Parameters<typeof buildFurnitureModelGroup>[0]

export interface FurnitureModelLookup {
  get(
    contentHash: string,
  ): { status: 'loading' | 'ready' | 'failed'; template?: FurnitureModel } | undefined
}

const BOX_ONLY: FurnitureModelLookup = { get: () => undefined }

export interface FramedSceneReconciler {
  reconcile(
    graph: SceneGraph,
    paint?: Record<string, SurfaceTreatment>,
    models?: FurnitureModelLookup,
  ): FramedScene
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
 * A built furniture sub-group, kept with the node it was built from and whether it was built
 * against a ready model. A box build can be swapped for a mesh build when its model turns ready.
 */
interface FurnitureSubgroupBuild {
  node: FurnitureSceneNode
  group: SceneRoot
  builtReady: boolean
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
  furniture: Map<string, FurnitureSubgroupBuild>
  readySignature: string
  framed: FramedScene
}

interface FloorEntities {
  walls: WallSceneNode[]
  rooms: RoomSceneNode[]
  openings: OpeningSceneNode[]
  furniture: FurnitureSceneNode[]
}

/** Narrows a scene graph's entity arrays to the active floor's model id. */
function floorEntities(graph: SceneGraph, floorNode: SceneNode): FloorEntities {
  const modelId = floorNode.id.slice(FLOOR_NODE_PREFIX.length)
  return {
    walls: graph.walls.filter((wall) => wall.floorId === modelId),
    rooms: graph.rooms.filter((room) => room.floorId === modelId),
    openings: graph.openings.filter((opening) => opening.floorId === modelId),
    furniture: graph.furniture.filter((item) => item.floorId === modelId),
  }
}

/**
 * A stable string of the floor's currently-ready furniture content hashes. When a model turns
 * ready this signature changes, defeating the whole-floor early-return so the piece can rebuild.
 */
function furnitureReadySignature(
  furniture: FurnitureSceneNode[],
  models: FurnitureModelLookup,
): string {
  return furniture
    .filter((node) => models.get(node.assetRef.contentHash)?.status === 'ready')
    .map((node) => node.assetRef.contentHash)
    .sort()
    .join('|')
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

/** Whether two arrays hold the same elements in the same order by reference. */
function sameRefs<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index])
}

/** The wall and hosted-opening nodes a wall sub-group is built from, and the prior build. */
interface WallBuildInput {
  entities: FloorEntities
  wallOpeningNodes: OpeningSceneNode[]
  materials: PaintMaterials
  prev: CachedFloorBuild | undefined
}

/**
 * Reuses the cached wall sub-group when every wall node and every hosted-opening node is
 * unchanged by reference, else rebuilds it. The wall sub-group is the floor's non-local unit
 * (junctions span walls), so it rebuilds whole when any of its inputs changes.
 */
function reuseOrBuildWall({
  entities,
  wallOpeningNodes,
  materials,
  prev,
}: WallBuildInput): WallBuild {
  if (
    prev !== undefined &&
    sameRefs(entities.walls, prev.wallNodes) &&
    sameRefs(wallOpeningNodes, prev.wallOpeningNodes)
  ) {
    return prev.wall
  }
  return buildWallSubgroup({ ...entities, materials })
}

/** Reuses a cached room sub-group when its derived node is unchanged in value, else rebuilds. */
function reuseOrBuildRoom(
  node: RoomSceneNode,
  materials: PaintMaterials,
  prev: CachedFloorBuild | undefined,
): SceneRoot {
  const cached = prev?.rooms.get(node.id)
  if (cached !== undefined && roomSceneNodeEqual(cached.node, node)) return cached.group
  return buildRoomSubgroup(node, materials)
}

/** Reuses a cached opening sub-group when its derived node reference is unchanged, else rebuilds. */
function reuseOrBuildOpening(
  node: OpeningSceneNode,
  materials: PaintMaterials,
  prev: CachedFloorBuild | undefined,
): SceneRoot {
  const cached = prev?.openings.get(node.id)
  if (cached !== undefined && cached.node === node) return cached.group
  return buildOpeningSubgroup(node, materials)
}

/** The inputs a furniture sub-group is reused or built from, including the model lookup. */
interface FurnitureBuildInput {
  node: FurnitureSceneNode
  materials: PaintMaterials
  prev: CachedFloorBuild | undefined
  models: FurnitureModelLookup
}

/** Builds a furniture sub-group from the real model when one is ready, else the massing box. */
function buildFurnitureGroup(
  node: FurnitureSceneNode,
  materials: PaintMaterials,
  entry: ReturnType<FurnitureModelLookup['get']>,
): SceneRoot {
  if (entry?.status === 'ready' && entry.template !== undefined) {
    return buildFurnitureModelGroup(entry.template.clone(true), node)
  }
  return buildFurnitureSubgroup(node, materials)
}

/**
 * Reuses a cached furniture sub-group only when its derived node reference is unchanged and the
 * readiness it was built against still matches; otherwise builds from the real model when one is
 * ready (a mesh sub-group) and falls back to the massing box.
 */
function reuseOrBuildFurniture({
  node,
  materials,
  prev,
  models,
}: FurnitureBuildInput): FurnitureSubgroupBuild {
  const entry = models.get(node.assetRef.contentHash)
  const builtReady = entry?.status === 'ready' && entry.template !== undefined
  const cached = prev?.furniture.get(node.id)
  if (cached !== undefined && cached.node === node && cached.builtReady === builtReady) {
    return cached
  }
  return { node, group: buildFurnitureGroup(node, materials, entry), builtReady }
}

/** Flattens the per-entity sub-group maps into the ordered group list a floor root is assembled from. */
function collectSubgroupGroups(
  rooms: Map<string, SubgroupBuild<RoomSceneNode>>,
  openings: Map<string, SubgroupBuild<OpeningSceneNode>>,
  furniture: Map<string, FurnitureSubgroupBuild>,
): SceneRoot[] {
  return [
    ...[...rooms.values()].map((build) => build.group),
    ...[...openings.values()].map((build) => build.group),
    ...[...furniture.values()].map((build) => build.group),
  ]
}

/** The inputs a single floor build is computed from, including the prior build to reuse. */
interface FloorBuildInput {
  floorNode: SceneNode
  entities: FloorEntities
  paint: Record<string, SurfaceTreatment>
  prev: CachedFloorBuild | undefined
  models: FurnitureModelLookup
  readySignature: string
}

/**
 * Builds a floor's sub-groups and frames it into a cached build. Rooms whose derived node is
 * unchanged in value reuse their prior sub-group; changed rooms, walls, and openings rebuild.
 */
function buildFloorBuild({
  floorNode,
  entities,
  paint,
  prev,
  models,
  readySignature,
}: FloorBuildInput): CachedFloorBuild {
  const materials = new PaintMaterialProvider({
    lightColor: kelvinToLinearRgb(DEFAULT_COLOR_TEMPERATURE_K),
    paint,
  })
  const wallOpeningNodes = entities.openings.filter((opening) => opening.hostWallId !== undefined)
  const wall = reuseOrBuildWall({ entities, wallOpeningNodes, materials, prev })
  const rooms = subgroupMap(entities.rooms, (node) => reuseOrBuildRoom(node, materials, prev))
  const openings = subgroupMap(entities.openings, (node) =>
    reuseOrBuildOpening(node, materials, prev),
  )
  const furniture = new Map(
    entities.furniture.map((node): [string, FurnitureSubgroupBuild] => [
      node.id,
      reuseOrBuildFurniture({ node, materials, prev, models }),
    ]),
  )
  const framed = frameFloor(floorNode, wall, collectSubgroupGroups(rooms, openings, furniture))
  const wallNodes = entities.walls
  return {
    floorNode,
    paint,
    wall,
    wallNodes,
    wallOpeningNodes,
    rooms,
    openings,
    furniture,
    readySignature,
    framed,
  }
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
    reconcile(graph, paint = {}, models = BOX_ONLY) {
      const floorNode = graph.nodes[0]
      // No active floor (a transient empty graph): build a throwaway scene without
      // caching, since there is no floor id to key it by.
      if (floorNode === undefined) {
        return buildFramedScene(graph, paint)
      }
      const entities = floorEntities(graph, floorNode)
      const readySignature = furnitureReadySignature(entities.furniture, models)
      const cached = buildsByFloorId.get(floorNode.id)
      if (
        cached !== undefined &&
        cached.floorNode === floorNode &&
        cached.paint === paint &&
        cached.readySignature === readySignature
      ) {
        return cached.framed
      }
      // A paint edit changes the paint reference, so prev is undefined and the floor rebuilds
      // whole; otherwise the prior build's unchanged room sub-groups are reused.
      const prev = cached !== undefined && cached.paint === paint ? cached : undefined
      const build = buildFloorBuild({ floorNode, entities, paint, prev, models, readySignature })
      buildsByFloorId.set(floorNode.id, build)
      return build.framed
    },
  }
}
