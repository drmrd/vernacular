import {
  DEFAULT_COLOR_TEMPERATURE_K,
  FLOOR_NODE_PREFIX,
  frameSceneCamera,
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
  addGroundPlane,
  assembleFloorRoot,
  buildFurnitureModelGroup,
  buildFurnitureSubgroup,
  buildOpeningSubgroup,
  buildRoomSubgroup,
  buildWallSubgroup,
  disposeObject,
  GRADE_ELEVATION_MM,
  isGroundPlane,
  PaintMaterialProvider,
  sceneBounds,
  type EdgeOverlayOptions,
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
interface FloorRequest {
  floorNode: SceneNode
  paint: Record<string, SurfaceTreatment>
  readySignature: string
}

/**
 * One floor's built scene, held as its individual sub-groups so a later edit can reuse
 * the ones whose entity did not change. The wall sub-group records the wall and hosted-
 * opening nodes it was built from (it is the floor's non-local unit and must rebuild
 * whole when any of them changes); rooms and openings keep one build per entity id.
 */
interface CachedFloorBuild extends FloorRequest {
  wall: WallBuild
  wallNodes: WallSceneNode[]
  wallOpeningNodes: OpeningSceneNode[]
  rooms: Map<string, SubgroupBuild<RoomSceneNode>>
  openings: Map<string, SubgroupBuild<OpeningSceneNode>>
  furniture: Map<string, FurnitureSubgroupBuild>
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
 * A stable string of the floor's furniture content hashes tagged with the appearance their model
 * status calls for (ready mesh, failed box, loading box, or plain box). When a model turns ready,
 * starts loading, or its load fails this signature changes, defeating the whole-floor early-return
 * so the piece can rebuild.
 */
function furnitureReadySignature(
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

/** The inputs a floor root is assembled and framed from, including its room outlines. */
interface FrameFloorInput {
  floorNode: SceneNode
  wall: WallBuild
  subgroups: SceneRoot[]
  roomPolygons: readonly (readonly Point[])[]
}

/** Assembles a floor root from its wall and entity sub-groups, recomputing bounds and pose. */
function frameFloor({ floorNode, wall, subgroups, roomPolygons }: FrameFloorInput): FramedScene {
  const root = assembleFloorRoot(floorNode, [wall.group, ...subgroups])
  const bounds = sceneBounds(root)
  return {
    root,
    pose: frameSceneCamera(bounds),
    bounds,
    nearWallTargets: wall.nearWallTargets,
    roomPolygons,
  }
}

/**
 * Seats the assembled root on the site ground plane at the graph's grade (issue #477;
 * ADR-0131, ADR-0138). The ground is per-scene, so it lives beside the floor group on the
 * root, never inside a cached floor sub-group, and this runs after the cache lookup: a
 * grade-only edit refreshes the plane in place while the whole floor build stays a cache
 * hit. A plane already seated at the requested grade is kept; otherwise every ground plane
 * on the root is removed and disposed before the fresh one is added, so no stale copy
 * survives reuse. Camera framing keeps ignoring it (sceneBounds skips isGroundPlane).
 */
function refreshGroundPlane(root: SceneRoot, gradeElevation: number | undefined): void {
  const grade = gradeElevation ?? GRADE_ELEVATION_MM
  const planes = root.children.filter(isGroundPlane)
  if (planes.length === 1 && planes[0]?.position.y === grade) return
  for (const plane of planes) {
    root.remove(plane)
    disposeObject(plane)
  }
  addGroundPlane(root, grade)
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

/**
 * The shared per-floor build context the sub-group reuse helpers read: the materials,
 * the view options (the edge-overlay toggle, fixed for the reconciler's lifetime), and
 * the prior build to reuse from.
 */
interface SubgroupBuildContext {
  materials: PaintMaterials
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
 * order (rooms first, then openings, then furniture) a floor root is assembled from.
 */
function collectSubgroupGroups(...maps: Map<string, { group: SceneRoot }>[]): SceneRoot[] {
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
 * Builds a floor's sub-groups and frames it into a cached build. Rooms whose derived node is
 * unchanged in value reuse their prior sub-group; changed rooms, walls, and openings rebuild.
 * The site ground plane is not built here: reconcile seats it on the assembled root after
 * the cache lookup, since it is per-scene state rather than part of any floor build.
 */
function buildFloorBuild(input: FloorBuildInput): CachedFloorBuild {
  const { floorNode, entities, paint, view, prev, models, readySignature } = input
  const materials = new PaintMaterialProvider({
    lightColor: kelvinToLinearRgb(DEFAULT_COLOR_TEMPERATURE_K),
    paint,
  })
  const context: SubgroupBuildContext = { materials, view, prev }
  const wallOpeningNodes = entities.openings.filter((opening) => opening.hostWallId !== undefined)
  const wall = reuseOrBuildWall({ entities, wallOpeningNodes, ...context })
  const rooms = subgroupMap(entities.rooms, (node) => reuseOrBuildRoom(node, context))
  const openings = subgroupMap(entities.openings, (node) => reuseOrBuildOpening(node, context))
  const furniture = furnitureMap(entities.furniture, models, context)
  const subgroups = collectSubgroupGroups(rooms, openings, furniture)
  const roomPolygons = entities.rooms.map((room) => room.polygon)
  const framed = frameFloor({ floorNode, wall, subgroups, roomPolygons })
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
    framed,
  }
}

/** Whether a cached build still matches the request in every keyed field, so it can be reused as-is. */
function isCachedBuildFresh(cached: CachedFloorBuild, request: FloorRequest): boolean {
  return (
    cached.floorNode === request.floorNode &&
    cached.paint === request.paint &&
    cached.readySignature === request.readySignature
  )
}

/**
 * Builds the preview scene for the active floor through the per-entity sub-group builders
 * and caches the build per floor id. When the active floor node and paint references are
 * both unchanged it returns the cached FramedScene with no rebuild and no camera reframe.
 * Otherwise it rebuilds the floor and stores the result. Holding one build per floor lets
 * an earlier floor's build survive reconciling a different floor, so switching back to it
 * is a cache hit. Reuse of the unchanged sub-groups within a rebuilt floor layers on top
 * of this build in the reuse tiers.
 *
 * The view options (the surface-edge overlay toggle, ADR-0132) are fixed for the
 * reconciler's lifetime, so every cached sub-group was built with the same setting; the
 * scene view constructs a fresh reconciler when the toggle flips, which discards the
 * stale builds rather than reusing groups that baked the other setting in.
 */
export function createFramedSceneReconciler(view: EdgeOverlayOptions = {}): FramedSceneReconciler {
  const buildsByFloorId = new Map<string, CachedFloorBuild>()

  return {
    reconcile(graph, paint = {}, models = BOX_ONLY) {
      const floorNode = graph.nodes[0]
      // No active floor (a transient empty graph): build a throwaway scene without
      // caching, since there is no floor id to key it by.
      if (floorNode === undefined) {
        return buildFramedScene(graph, paint, view)
      }
      const entities = floorEntities(graph, floorNode)
      const request: FloorRequest = {
        floorNode,
        paint,
        readySignature: furnitureReadySignature(entities.furniture, models),
      }
      const cached = buildsByFloorId.get(floorNode.id)
      if (cached !== undefined && isCachedBuildFresh(cached, request)) {
        refreshGroundPlane(cached.framed.root, graph.gradeElevation)
        return cached.framed
      }
      // A paint edit changes the paint reference, so prev is undefined and the floor rebuilds
      // whole; otherwise the prior build's unchanged room sub-groups are reused.
      const prev = cached !== undefined && cached.paint === paint ? cached : undefined
      const build = buildFloorBuild({ ...request, entities, view, prev, models })
      buildsByFloorId.set(floorNode.id, build)
      refreshGroundPlane(build.framed.root, graph.gradeElevation)
      return build.framed
    },
  }
}
