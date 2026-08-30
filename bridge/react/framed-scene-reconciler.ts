import {
  ceilingHeight,
  DEFAULT_CEILING_HEIGHT_MM,
  type SceneGraph,
  type SceneNode,
  type SurfaceTreatment,
} from '../../core'
import type { EdgeOverlayOptions } from '../../engine'
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
}

/** Maps a cached floor build to the assembly input frameStackedScene stacks it from: its
 *  node, its ordered sub-group list (wall first, then rooms, openings, furniture), the
 *  entities its fade targets enroll from, the room outlines it contributes, and its own
 *  reach toward the building top (its elevation plus its own tallest room's ceiling,
 *  falling back to DEFAULT_CEILING_HEIGHT_MM when it has no rooms, consistent with
 *  buildFramedScene's single-floor computation). */
function floorAssembly(build: CachedFloorBuild): FloorAssembly {
  const roomCeilingHeights = build.entities.rooms.map((room) => ceilingHeight(room))
  const topWorld =
    build.floorNode.elevation +
    (roomCeilingHeights.length > 0 ? Math.max(...roomCeilingHeights) : DEFAULT_CEILING_HEIGHT_MM)
  return {
    node: build.floorNode,
    subgroups: [build.wall, ...collectSubgroupGroups(build.rooms, build.openings, build.furniture)],
    entities: build.entities,
    roomPolygons: build.roomPolygons,
    topWorld,
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
}

/**
 * Returns the cached build for a floor when its node, paint, and furniture readiness are
 * all unchanged, else builds it afresh (reusing the unchanged sub-groups of the prior
 * build when only the paint reference is unchanged) and stores it under the floor id.
 */
function reuseOrBuildFloor(node: SceneNode, pass: ReconcilePass): CachedFloorBuild {
  const { graph, paint, models, view, cache } = pass
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
  keptKey: string,
  builds: CachedFloorBuild[],
): void {
  for (const [otherKey, scene] of scenes) {
    if (otherKey !== keptKey && scene.builds.some((build) => builds.includes(build))) {
      scenes.delete(otherKey)
    }
  }
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
 */
export function createFramedSceneReconciler(view: EdgeOverlayOptions = {}): FramedSceneReconciler {
  const buildsByFloorId = new Map<string, CachedFloorBuild>()
  const scenesByFloorSet = new Map<string, AssembledScene>()

  return {
    reconcile(graph, paint = {}, models = BOX_ONLY) {
      // No floors (a transient empty graph): build a throwaway scene without caching,
      // since there is no floor id to key it by.
      if (graph.nodes.length === 0) {
        return buildFramedScene(graph, paint, view)
      }
      const pass: ReconcilePass = { graph, paint, models, view, cache: buildsByFloorId }
      const builds = graph.nodes.map((node) => reuseOrBuildFloor(node, pass))
      const key = graph.nodes.map((node) => node.id).join(FLOOR_SET_SEPARATOR)
      const cached = scenesByFloorSet.get(key)
      if (cached !== undefined && sameRefs(cached.builds, builds)) {
        refreshGroundPlane(cached.framed.root, graph.gradeElevation)
        return cached.framed
      }
      const framed = frameStackedScene(builds.map(floorAssembly), graph.gradeElevation)
      evictScenesSharingBuilds(scenesByFloorSet, key, builds)
      scenesByFloorSet.set(key, { framed, builds })
      return framed
    },
  }
}
