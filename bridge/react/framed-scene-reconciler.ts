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
import type { ScopedSceneGraph } from './view-scene-graph'

const BOX_ONLY: FurnitureModelLookup = { get: () => undefined }

type Paint = Record<string, SurfaceTreatment>

// The paint a reconcile uses when the caller passes none, shared so repeated paint-less
// reconciles see the same reference.
const NO_PAINT: Paint = {}

// Joins the floor node ids into the key a stacked scene is cached under, so a scene is
// reused only when the exact same floors, in the same order, are reconciled again.
const FLOOR_SET_SEPARATOR = '|'

export interface FramedSceneReconciler {
  reconcile(graph: ScopedSceneGraph, paint?: Paint, models?: FurnitureModelLookup): FramedScene
  /**
   * Frees what earlier reconciles replaced, but only when `displayed` is the scene the latest
   * reconcile returned. For any other scene it frees nothing and keeps the queue for a later call:
   * that older scene can still be drawn, and later reconciles may have retired parts of it.
   */
  releaseRetired(displayed: FramedScene): void
  /**
   * Frees everything the reconciler still holds: every cached floor build and its provider, the
   * ground planes of cached scenes, the current empty-graph scene, and the retired queue. Each
   * resource is freed once, resources a long-lived owner holds (a model template) are left alone,
   * and a second call frees nothing more. The caches are emptied, so a later reconcile rebuilds
   * every floor from scratch.
   */
  dispose(): void
}

type RetiredObject = Parameters<typeof disposeObject>[0]

/**
 * What reconciles replaced and nothing draws any more: rebuilt sub-groups, ground planes of
 * dropped scenes, superseded empty-graph scenes, and providers whose build lineage ended. They
 * wait here rather than being freed at once, because a render must not free what the scene on
 * screen may still draw; releaseRetired frees them once the scene the latest reconcile returned
 * is the one drawn. Disposing the reconciler routes everything it holds through the queue too.
 * One free happens at once: a cache hit with a new grade swaps the cached scene's ground plane
 * in place (refreshGroundPlane), and the old plane is detached in the same call, so no root
 * can draw it after it is freed.
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

/**
 * Retires everything the caches still hold: every cached build's sub-groups and provider, and
 * every cached scene's ground plane. The caller empties the caches afterwards.
 */
function retireEverything(
  builds: Map<string, CachedFloorBuild>,
  scenes: Map<string, AssembledScene>,
  retired: RetiredResources,
): void {
  for (const build of builds.values()) {
    for (const group of buildGroups(build)) retired.objects.add(group)
    retired.providers.add(build.materials)
  }
  for (const scene of scenes.values()) retireGroundPlanes(scene.framed, retired)
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
  graph: ScopedSceneGraph
  paint: Paint
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

/** The scene of a graph with no floors, kept with the graph and paint it was built from so a
 *  reconcile with the same references (a StrictMode double render) returns it untouched. */
interface EmptyGraphScene {
  framed: FramedScene
  graph: SceneGraph
  paint: Paint
}

/** Whether the cached empty-graph scene was built from exactly this empty graph and paint. */
function isSameEmptyGraph(scene: EmptyGraphScene, graph: SceneGraph, paint: Paint): boolean {
  return scene.graph === graph && scene.paint === paint
}

function buildEmptyGraphScene(
  graph: SceneGraph,
  paint: Paint,
  view: EdgeOverlayOptions,
): EmptyGraphScene {
  return { framed: buildFramedScene(graph, paint, view), graph, paint }
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
function evictScenesOfReplacedBuilds(
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
 * holds the exact same builds. Any cached scene this pass drops retires its ground plane: one
 * whose floor builds were replaced, one that shares a build with the new scene, or one the new
 * scene replaces under an ambiguous floor-set key (a floor id containing the separator).
 */
function reconcileStackedScene(
  pass: ReconcilePass,
  scenes: Map<string, AssembledScene>,
): FramedScene {
  const { graph, cache, retired } = pass
  const builds = graph.nodes.map((node) => reuseOrBuildFloor(node, pass))
  evictScenesOfReplacedBuilds(scenes, cache, retired)
  const key = graph.nodes.map((node) => node.id).join(FLOOR_SET_SEPARATOR)
  const cached = scenes.get(key)
  if (cached !== undefined && sameRefs(cached.builds, builds)) {
    refreshGroundPlane(cached.framed.root, graph.gradeElevation)
    return cached.framed
  }
  const framed = frameStackedScene(
    builds.map(floorAssembly),
    graph.gradeElevation,
    graph.framedFloorId,
  )
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
 * freed, until the caller runs releaseRetired with the scene the latest reconcile returned,
 * once that scene is the one drawn. dispose frees everything still held, for the owner that
 * drops the reconciler.
 */
export function createFramedSceneReconciler(view: EdgeOverlayOptions = {}): FramedSceneReconciler {
  const buildsByFloorId = new Map<string, CachedFloorBuild>()
  const scenesByFloorSet = new Map<string, AssembledScene>()
  const retired: RetiredResources = { objects: new Set(), providers: new Set() }
  let emptyScene: EmptyGraphScene | undefined
  let latest: FramedScene | undefined

  function reconcileGraph(graph: ScopedSceneGraph, paint: Paint, models: FurnitureModelLookup) {
    if (emptyScene !== undefined) {
      if (isSameEmptyGraph(emptyScene, graph, paint)) return emptyScene.framed
      retired.objects.add(emptyScene.framed.root)
    }
    emptyScene = undefined
    // No floors: no floor id to key a build by, so the scene is kept by graph and paint alone.
    if (graph.nodes.length === 0) {
      emptyScene = buildEmptyGraphScene(graph, paint, view)
      return emptyScene.framed
    }
    const pass: ReconcilePass = { graph, paint, models, view, cache: buildsByFloorId, retired }
    return reconcileStackedScene(pass, scenesByFloorSet)
  }

  return {
    reconcile(graph, paint = NO_PAINT, models = BOX_ONLY) {
      latest = reconcileGraph(graph, paint, models)
      return latest
    },
    releaseRetired(displayed) {
      if (displayed === latest) freeRetired(retired)
    },
    dispose() {
      retireEverything(buildsByFloorId, scenesByFloorSet, retired)
      if (emptyScene !== undefined) retired.objects.add(emptyScene.framed.root)
      buildsByFloorId.clear()
      scenesByFloorSet.clear()
      emptyScene = undefined
      latest = undefined
      freeRetired(retired)
    },
  }
}
