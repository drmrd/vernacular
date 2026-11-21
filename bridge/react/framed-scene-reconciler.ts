import { type SceneGraph, type SceneNode, type SurfaceTreatment } from '../../core'
import {
  disposeObject,
  isGroundPlane,
  type EdgeOverlayOptions,
  type PhysicalMaterialProvider,
  type SceneRoot,
} from '../../engine'
import {
  buildFloorBuild,
  collectSubgroupGroups,
  floorEntities,
  furnitureReadySignature,
  isCachedBuildFresh,
  sameRefs,
  type CachedFloorBuild,
  type FloorRequest,
  type FurnitureModelLookup,
} from './floor-build'
import {
  buildFramedScene,
  floorTopWorld,
  frameStackedScene,
  refreshGroundPlane,
  type FloorAssembly,
  type FramedScene,
} from './framed-scene'

const BOX_ONLY: FurnitureModelLookup = { get: () => undefined }

// Joins the floor node ids into the key a stacked scene is cached under, so a scene is
// reused only when the exact same floors, in the same order, are reconciled again.
const FLOOR_SET_SEPARATOR = '|'

export interface FramedSceneReconciler {
  reconcile(
    graph: SceneGraph,
    paint?: Record<string, SurfaceTreatment>,
    models?: FurnitureModelLookup,
  ): FramedScene
  /** Frees what earlier reconciles replaced. Call it once the scene they returned is live. */
  releaseRetired(): void
}

type RetiredObject = Parameters<typeof disposeObject>[0]

/**
 * What reconciles replaced and nothing draws any more: rebuilt sub-groups, ground planes of
 * dropped scenes, superseded empty-graph scenes, and providers whose build lineage ended. They
 * wait here rather than being freed at once, so reconcile stays free of side effects on the
 * scene still on screen; releaseRetired frees them after the new scene commits.
 */
interface RetiredResources {
  objects: Set<RetiredObject>
  providers: Set<PhysicalMaterialProvider>
}

/** A floor build's sub-groups in assembly order: the wall first, then rooms, openings, furniture. */
function buildGroups(build: CachedFloorBuild): SceneRoot[] {
  return [build.wall, ...collectSubgroupGroups(build.rooms, build.openings, build.furniture)]
}

/**
 * Retires every sub-group of a replaced floor build that its successor did not reuse, by
 * identity, so a reused group is never freed. The provider retires only when the successor
 * draws from a different one, which is the end of the floor's build lineage (a paint edit).
 */
function retireReplacedBuild(
  replaced: CachedFloorBuild,
  successor: CachedFloorBuild,
  retired: RetiredResources,
): void {
  const kept = new Set(buildGroups(successor))
  for (const group of buildGroups(replaced)) {
    if (!kept.has(group)) retired.objects.add(group)
  }
  if (replaced.materials !== successor.materials) retired.providers.add(replaced.materials)
}

/**
 * Retires the ground plane of a dropped scene, and nothing else of it: its floor groups'
 * sub-groups belong to cached floor builds, which retire them when they are replaced.
 */
function retireGroundPlanes(framed: FramedScene, retired: RetiredResources): void {
  for (const plane of framed.root.children.filter(isGroundPlane)) retired.objects.add(plane)
}

/** Frees every retired object and provider, then empties the queue. */
function freeRetired(retired: RetiredResources): void {
  for (const object of retired.objects) disposeObject(object)
  for (const provider of retired.providers) provider.dispose()
  retired.objects.clear()
  retired.providers.clear()
}

/** Maps a cached floor build to the assembly input frameStackedScene stacks it from: its
 *  node, its ordered sub-group list (wall first, then rooms, openings, furniture), the
 *  entities its fade targets enroll from, the room outlines it contributes, and its own
 *  reach toward the building top (floorTopWorld). */
function floorAssembly(build: CachedFloorBuild): FloorAssembly {
  return {
    node: build.floorNode,
    subgroups: buildGroups(build),
    entities: build.entities,
    roomPolygons: build.roomPolygons,
    topWorld: floorTopWorld(build.floorNode.elevation, build.entities.rooms),
  }
}

/** The per-reconcile inputs each floor's build is derived from, bundled to stay within
 *  the argument limit. */
interface ReconcilePass {
  graph: SceneGraph
  paint: Record<string, SurfaceTreatment>
  models: FurnitureModelLookup
  view: EdgeOverlayOptions
  cache: Map<string, CachedFloorBuild>
  retired: RetiredResources
}

/**
 * Returns the cached build for a floor when its node, paint, and furniture readiness are
 * all unchanged, else builds it afresh (reusing the unchanged sub-groups of the prior
 * build when only the paint reference is unchanged) and stores it under the floor id.
 */
function reuseOrBuildFloor(node: SceneNode, pass: ReconcilePass): CachedFloorBuild {
  const { graph, paint, models, view, cache, retired } = pass
  const entities = floorEntities(graph, node)
  const request: FloorRequest = {
    floorNode: node,
    paint,
    readySignature: furnitureReadySignature(entities.furniture, models),
  }
  const cached = cache.get(node.id)
  if (cached !== undefined && isCachedBuildFresh(cached, request)) {
    return cached
  }
  // A paint edit changes the paint reference, so prev is undefined and the floor rebuilds
  // whole; otherwise the prior build's unchanged room sub-groups are reused.
  const prev = cached !== undefined && cached.paint === paint ? cached : undefined
  const build = buildFloorBuild({ ...request, entities, view, prev, models })
  if (cached !== undefined) retireReplacedBuild(cached, build, retired)
  cache.set(node.id, build)
  return build
}

/** A framed scene together with the floor builds it stacked, so a later reconcile that
 *  reuses the exact same builds, in the same order, returns it untouched. */
interface AssembledScene {
  framed: FramedScene
  builds: CachedFloorBuild[]
}

/**
 * Drops every other cached scene that shares a floor build with the scene just assembled.
 * Assembling reparents a reused build's sub-groups into the new root, stranding them in any
 * earlier scene that also held that build (for instance the active-floor scene of a floor
 * that also appears in the whole-building scene). Evicting those scenes forces a rebuild on
 * their next reconcile rather than a cache hit returning a scene missing that floor.
 */
function evictScenesSharingBuilds(
  scenes: Map<string, AssembledScene>,
  kept: { key: string; builds: CachedFloorBuild[] },
  retired: RetiredResources,
): void {
  for (const [otherKey, scene] of scenes) {
    if (otherKey !== kept.key && scene.builds.some((build) => kept.builds.includes(build))) {
      scenes.delete(otherKey)
      retireGroundPlanes(scene.framed, retired)
    }
  }
}

/**
 * Drops every cached scene that stacked a floor build the cache has since replaced. Such a
 * scene can never be returned again, because a cache hit compares against the current builds,
 * so its ground plane retires now rather than waiting for its floor set to come back.
 */
function evictStaleScenes(
  scenes: Map<string, AssembledScene>,
  cache: Map<string, CachedFloorBuild>,
  retired: RetiredResources,
): void {
  for (const [key, scene] of scenes) {
    if (scene.builds.some((build) => cache.get(build.floorNode.id) !== build)) {
      scenes.delete(key)
      retireGroundPlanes(scene.framed, retired)
    }
  }
}

/**
 * Stacks the pass's floors into a scene, returning the cached scene for the floor set when it
 * holds the exact same builds. A scene this replaces, evicts, or leaves stale retires its
 * ground plane.
 */
function reconcileStackedScene(
  pass: ReconcilePass,
  scenes: Map<string, AssembledScene>,
): FramedScene {
  const { graph, cache, retired } = pass
  const builds = graph.nodes.map((node) => reuseOrBuildFloor(node, pass))
  evictStaleScenes(scenes, cache, retired)
  const key = graph.nodes.map((node) => node.id).join(FLOOR_SET_SEPARATOR)
  const cached = scenes.get(key)
  if (cached !== undefined && sameRefs(cached.builds, builds)) {
    refreshGroundPlane(cached.framed.root, graph.gradeElevation)
    return cached.framed
  }
  const framed = frameStackedScene(builds.map(floorAssembly), graph.gradeElevation)
  evictScenesSharingBuilds(scenes, { key, builds }, retired)
  if (cached !== undefined) retireGroundPlanes(cached.framed, retired)
  scenes.set(key, { framed, builds })
  return framed
}

/**
 * Builds the preview scene by stacking every floor of the graph through the per-entity
 * sub-group builders, caching each floor's build per floor id so an unchanged floor is
 * reused across reconciles. A single-floor (active-floor) graph is the one-floor case;
 * a whole-building graph (issue #479, ADR-0127) stacks one floor group per node at its
 * elevation, frames the camera over the whole building, and seats a single ground plane
 * sized to the whole footprint. The assembled scene is cached per floor set, so an
 * unchanged floor set returns the same FramedScene with no rebuild and no camera reframe.
 *
 * The view options (the surface-edge overlay toggle, ADR-0132) are fixed for the
 * reconciler's lifetime, so every cached sub-group was built with the same setting; the
 * scene view constructs a fresh reconciler when the toggle flips, which discards the
 * stale builds rather than reusing groups that baked the other setting in.
 *
 * What a reconcile replaces (a rebuilt sub-group, a floor build and provider a paint edit
 * replaced, a dropped scene's ground plane, a superseded empty-graph scene) is retired, not
 * freed, until the caller runs releaseRetired once the returned scene is live.
 */
export function createFramedSceneReconciler(view: EdgeOverlayOptions = {}): FramedSceneReconciler {
  const buildsByFloorId = new Map<string, CachedFloorBuild>()
  const scenesByFloorSet = new Map<string, AssembledScene>()
  const retired: RetiredResources = { objects: new Set(), providers: new Set() }
  let emptyScene: FramedScene | undefined

  return {
    reconcile(graph, paint = {}, models = BOX_ONLY) {
      if (emptyScene !== undefined) retired.objects.add(emptyScene.root)
      emptyScene = undefined
      // No floors (a transient empty graph): build a throwaway scene without caching,
      // since there is no floor id to key it by. The next reconcile supersedes and retires it.
      if (graph.nodes.length === 0) {
        emptyScene = buildFramedScene(graph, paint, view)
        return emptyScene
      }
      const pass: ReconcilePass = { graph, paint, models, view, cache: buildsByFloorId, retired }
      return reconcileStackedScene(pass, scenesByFloorSet)
    },
    releaseRetired() {
      freeRetired(retired)
    },
  }
}
