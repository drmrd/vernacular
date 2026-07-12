import type { SceneGraph, SceneNode, SurfaceTreatment } from '../../core'
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

// The furniture model lookup is defined with the floor-build layer that consumes it; it
// is re-exported here because the model cache imports it from the reconciler module.
export type { FurnitureModelLookup }

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
 *  node, its ordered sub-group list (wall first, then rooms, openings, furniture), and the
 *  fade targets and room outlines it contributes. */
function floorAssembly(build: CachedFloorBuild): FloorAssembly {
  return {
    node: build.floorNode,
    subgroups: [
      build.wall.group,
      ...collectSubgroupGroups(build.rooms, build.openings, build.furniture),
    ],
    nearWallTargets: build.wall.nearWallTargets,
    roomPolygons: build.roomPolygons,
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
      scenesByFloorSet.set(key, { framed, builds })
      return framed
    },
  }
}
