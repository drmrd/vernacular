import type { SceneGraph, SceneNode, SurfaceTreatment } from '../../core'
import { buildFramedScene, type FramedScene } from './framed-scene'

export interface FramedSceneReconciler {
  reconcile(graph: SceneGraph, paint?: Record<string, SurfaceTreatment>): FramedScene
}

interface CachedFloorBuild {
  floorNode: SceneNode
  paint: Record<string, SurfaceTreatment>
  framed: FramedScene
}

/**
 * Caches a built FramedScene per active floor id, keyed within each floor by the floor node object
 * and the paint map, so that a repeated reconcile of the same floor node and paint returns the same
 * FramedScene reference without rebuilding. Holding one build per floor lets an earlier floor's
 * build survive reconciling a different floor, so switching back to it is a cache hit. A new floor
 * node object (even with the same id) or a new paint object replaces that floor's cached build.
 */
export function createFramedSceneReconciler(): FramedSceneReconciler {
  const buildsByFloorId = new Map<string, CachedFloorBuild>()

  return {
    reconcile(graph, paint = {}) {
      const floorNode = graph.nodes[0]
      if (floorNode === undefined) {
        return buildFramedScene(graph, paint)
      }
      const cached = buildsByFloorId.get(floorNode.id)
      if (cached !== undefined && cached.floorNode === floorNode && cached.paint === paint) {
        return cached.framed
      }
      const framed = buildFramedScene(graph, paint)
      buildsByFloorId.set(floorNode.id, { floorNode, paint, framed })
      return framed
    },
  }
}
