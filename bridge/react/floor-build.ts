import {
  DEFAULT_COLOR_TEMPERATURE_K,
  FLOOR_NODE_PREFIX,
  kelvinToLinearRgb,
  type FurnitureSceneNode,
  type OpeningSceneNode,
  type Point,
  type RoomSceneNode,
  type SceneGraph,
  type SceneNode,
  type SurfaceTreatment,
  type WallSceneNode,
} from '../../core'
import {
  buildFurnitureModelGroup,
  buildFurnitureSubgroup,
  buildOpeningSubgroup,
  buildRoomSubgroup,
  buildWallSubgroup,
  PhysicalMaterialProvider,
  type EdgeOverlayOptions,
  type MaterialProvider,
  type NearWallTarget,
  type SceneRoot,
} from '../../engine'
import { roomSceneNodeEqual } from './room-scene-node-equal'

type FurnitureModel = Parameters<typeof buildFurnitureModelGroup>[0]

export interface FurnitureModelLookup {
  get(
    contentHash: string,
  ): { status: 'loading' | 'ready' | 'failed'; template?: FurnitureModel } | undefined
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

/** Which furniture appearance a sub-group was built as: a ready mesh, the failed box, the loading box, or the plain box. */
type FurnitureBuildKind = 'mesh' | 'failedBox' | 'loadingBox' | 'box'

/**
 * A built furniture sub-group, kept with the node it was built from and which appearance it was
 * built as. A box build can be swapped for a mesh build when its model turns ready, or for the
 * failed box when its model load fails, so the kind (not just node ref) decides reuse.
 */
interface FurnitureSubgroupBuild {
  node: FurnitureSceneNode
  group: SceneRoot
  buildKind: FurnitureBuildKind
}

/**
 * The identity a cached floor build is keyed on: the active floor node, the paint set, and
 * the furniture readiness signature. A later reconcile that matches all three reuses the
 * cached build untouched (isCachedBuildFresh); any difference rebuilds. The site grade is
 * deliberately not part of the key: the ground plane is per-scene, refreshed on the
 * assembled root after the cache lookup, so a grade-only edit stays a cache hit.
 */
export interface FloorRequest {
  floorNode: SceneNode
  paint: Record<string, SurfaceTreatment>
  readySignature: string
}

/**
 * One floor's built sub-groups, held individually so a later edit can reuse the ones
 * whose entity did not change. The wall sub-group records the wall and hosted-opening
 * nodes it was built from (it is the floor's non-local unit and must rebuild whole when
 * any of them changes); rooms and openings keep one build per entity id. The floor's
 * room outlines ride along so the assembled scene can union them across floors. A build
 * carries no assembled root of its own: reconcile stacks the sub-groups into the scene
 * root, so an unchanged floor's build seats into whichever scene reuses it.
 */
export interface CachedFloorBuild extends FloorRequest {
  wall: WallBuild
  wallNodes: WallSceneNode[]
  wallOpeningNodes: OpeningSceneNode[]
  rooms: Map<string, SubgroupBuild<RoomSceneNode>>
  openings: Map<string, SubgroupBuild<OpeningSceneNode>>
  furniture: Map<string, FurnitureSubgroupBuild>
  roomPolygons: readonly (readonly Point[])[]
}

interface FloorEntities {
  walls: WallSceneNode[]
  rooms: RoomSceneNode[]
  openings: OpeningSceneNode[]
  furniture: FurnitureSceneNode[]
}

/** Narrows a scene graph's entity arrays to the active floor's model id. */
export function floorEntities(graph: SceneGraph, floorNode: SceneNode): FloorEntities {
  const modelId = floorNode.id.slice(FLOOR_NODE_PREFIX.length)
  return {
    walls: graph.walls.filter((wall) => wall.floorId === modelId),
    rooms: graph.rooms.filter((room) => room.floorId === modelId),
    openings: graph.openings.filter((opening) => opening.floorId === modelId),
    furniture: graph.furniture.filter((item) => item.floorId === modelId),
  }
}

/**
 * A stable string of the floor's furniture content hashes tagged with the appearance their model
 * status calls for (ready mesh, failed box, loading box, or plain box). When a model turns ready,
 * starts loading, or its load fails this signature changes, defeating the whole-floor early-return
 * so the piece can rebuild.
 */
export function furnitureReadySignature(
  furniture: FurnitureSceneNode[],
  models: FurnitureModelLookup,
): string {
  return furniture
    .map(
      (node) =>
        `${node.assetRef.contentHash}:${furnitureBuildKind(models.get(node.assetRef.contentHash))}`,
    )
    .sort()
    .join('|')
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
export function sameRefs<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index])
}

/**
 * The shared per-floor build context the sub-group reuse helpers read: the materials,
 * the view options (the edge-overlay toggle, fixed for the reconciler's lifetime), and
 * the prior build to reuse from.
 */
interface SubgroupBuildContext {
  materials: MaterialProvider
  view: EdgeOverlayOptions
  prev: CachedFloorBuild | undefined
}

/** The wall and hosted-opening nodes a wall sub-group is built from, with the build context. */
interface WallBuildInput extends SubgroupBuildContext {
  entities: FloorEntities
  wallOpeningNodes: OpeningSceneNode[]
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
  view,
  prev,
}: WallBuildInput): WallBuild {
  if (
    prev !== undefined &&
    sameRefs(entities.walls, prev.wallNodes) &&
    sameRefs(wallOpeningNodes, prev.wallOpeningNodes)
  ) {
    return prev.wall
  }
  return buildWallSubgroup({ ...entities, materials, ...view })
}

/** Reuses a cached room sub-group when its derived node is unchanged in value, else rebuilds. */
function reuseOrBuildRoom(node: RoomSceneNode, context: SubgroupBuildContext): SceneRoot {
  const cached = context.prev?.rooms.get(node.id)
  if (cached !== undefined && roomSceneNodeEqual(cached.node, node)) return cached.group
  return buildRoomSubgroup(node, context.materials, context.view)
}

/** Reuses a cached opening sub-group when its derived node reference is unchanged, else rebuilds. */
function reuseOrBuildOpening(node: OpeningSceneNode, context: SubgroupBuildContext): SceneRoot {
  const cached = context.prev?.openings.get(node.id)
  if (cached !== undefined && cached.node === node) return cached.group
  return buildOpeningSubgroup(node, context.materials, context.view)
}

/** The inputs a furniture sub-group is reused or built from, including the model lookup. */
interface FurnitureBuildInput extends SubgroupBuildContext {
  node: FurnitureSceneNode
  models: FurnitureModelLookup
}

/**
 * Whether a lookup entry yields a ready model. The single source of "this entry builds a mesh":
 * the furnitureBuildKind helper and the mesh-vs-box build branch both call it, and as a type
 * guard it narrows entry.template so the build can clone it without a separate undefined check.
 */
function providesReadyModel(
  entry: ReturnType<FurnitureModelLookup['get']>,
): entry is { status: 'ready'; template: FurnitureModel } {
  return entry?.status === 'ready' && entry.template !== undefined
}

/**
 * Which appearance a lookup entry calls for: a ready model yields a mesh, a failed load yields the
 * failed box, a loading entry yields the loading box, and a missing entry yields the plain box. This
 * single decision feeds both the build branch and the reuse key, so a loading box, a failed box, and
 * a plain box carry distinct keys.
 */
function furnitureBuildKind(entry: ReturnType<FurnitureModelLookup['get']>): FurnitureBuildKind {
  if (providesReadyModel(entry)) return 'mesh'
  if (entry?.status === 'failed') return 'failedBox'
  if (entry?.status === 'loading') return 'loadingBox'
  return 'box'
}

/**
 * Builds a furniture sub-group from the real model when one is ready, the failed box when its load
 * failed, the loading box while its model is fetching, and the plain massing box otherwise. The
 * boxes take the view's edge-overlay option; a loaded model never carries the overlay (ADR-0132).
 */
function buildFurnitureGroup(
  { node, materials, view }: FurnitureBuildInput,
  entry: ReturnType<FurnitureModelLookup['get']>,
): SceneRoot {
  if (providesReadyModel(entry)) {
    return buildFurnitureModelGroup(entry.template.clone(true), node)
  }
  if (entry?.status === 'failed') {
    return buildFurnitureSubgroup(node, materials, { role: 'furnitureFailed', ...view })
  }
  if (entry?.status === 'loading') {
    return buildFurnitureSubgroup(node, materials, { role: 'furnitureLoading', ...view })
  }
  return buildFurnitureSubgroup(node, materials, view)
}

/**
 * Reuses a cached furniture sub-group only when its derived node reference is unchanged and the
 * appearance it was built as still matches; otherwise builds from the real model when one is
 * ready (a mesh sub-group), the failed box when its load failed, and the plain massing box
 * otherwise. The build kind distinguishes a loading box from a failed box so the loading->failed
 * transition rebuilds the one sub-group rather than reusing the stale loading box.
 */
function reuseOrBuildFurniture(input: FurnitureBuildInput): FurnitureSubgroupBuild {
  const { node, prev, models } = input
  const entry = models.get(node.assetRef.contentHash)
  const buildKind = furnitureBuildKind(entry)
  const cached = prev?.furniture.get(node.id)
  if (cached !== undefined && cached.node === node && cached.buildKind === buildKind) {
    return cached
  }
  return { node, group: buildFurnitureGroup(input, entry), buildKind }
}

/**
 * Flattens the per-entity sub-group maps into one ordered group list, preserving the argument
 * order (rooms first, then openings, then furniture) a floor group is assembled from.
 */
export function collectSubgroupGroups(...maps: Map<string, { group: SceneRoot }>[]): SceneRoot[] {
  return maps.flatMap((map) => [...map.values()].map((build) => build.group))
}

/** Builds a per-id map of furniture sub-groups, reusing each unchanged piece and tracking its build kind. */
function furnitureMap(
  furniture: FurnitureSceneNode[],
  models: FurnitureModelLookup,
  context: SubgroupBuildContext,
): Map<string, FurnitureSubgroupBuild> {
  return new Map(
    furniture.map((node): [string, FurnitureSubgroupBuild] => [
      node.id,
      reuseOrBuildFurniture({ node, models, ...context }),
    ]),
  )
}

/** The inputs a single floor build is computed from, including the prior build to reuse. */
interface FloorBuildInput extends FloorRequest {
  entities: FloorEntities
  view: EdgeOverlayOptions
  prev: CachedFloorBuild | undefined
  models: FurnitureModelLookup
}

/**
 * Builds a floor's sub-groups into a cached build. Rooms whose derived node is unchanged
 * in value reuse their prior sub-group; changed rooms, walls, and openings rebuild. The
 * build holds no assembled root or ground plane: reconcile stacks the sub-groups into the
 * scene root and seats the shared ground plane per scene, after the cache lookup.
 */
export function buildFloorBuild(input: FloorBuildInput): CachedFloorBuild {
  const { floorNode, entities, paint, view, prev, models, readySignature } = input
  const materials = new PhysicalMaterialProvider({
    lightColor: kelvinToLinearRgb(DEFAULT_COLOR_TEMPERATURE_K),
    paint,
  })
  const context: SubgroupBuildContext = { materials, view, prev }
  const wallOpeningNodes = entities.openings.filter((opening) => opening.hostWallId !== undefined)
  const wall = reuseOrBuildWall({ entities, wallOpeningNodes, ...context })
  const rooms = subgroupMap(entities.rooms, (node) => reuseOrBuildRoom(node, context))
  const openings = subgroupMap(entities.openings, (node) => reuseOrBuildOpening(node, context))
  const furniture = furnitureMap(entities.furniture, models, context)
  return {
    floorNode,
    paint,
    readySignature,
    wall,
    wallNodes: entities.walls,
    wallOpeningNodes,
    rooms,
    openings,
    furniture,
    roomPolygons: entities.rooms.map((room) => room.polygon),
  }
}

/** Whether a cached build still matches the request in every keyed field, so it can be reused as-is. */
export function isCachedBuildFresh(cached: CachedFloorBuild, request: FloorRequest): boolean {
  return (
    cached.floorNode === request.floorNode &&
    cached.paint === request.paint &&
    cached.readySignature === request.readySignature
  )
}
