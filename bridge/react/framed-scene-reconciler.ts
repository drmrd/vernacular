import type { SceneGraph, SceneNode, SurfaceTreatment } from '../../core'
import { buildFramedScene, type FramedScene } from './framed-scene'

export interface FramedSceneReconciler {
  reconcile(graph: SceneGraph, paint?: Record<string, SurfaceTreatment>): FramedScene
}

/**
 * Caches a single built FramedScene keyed by the active floor node object so that a repeated
 * reconcile of the same floor node returns the same FramedScene reference without rebuilding.
 * A new floor node object (even with the same id) replaces the cached build.
 */
export function createFramedSceneReconciler(): FramedSceneReconciler {
  let cachedFloorNode: SceneNode | undefined
  let cachedScene: FramedScene | undefined

  return {
    reconcile(graph, paint = {}) {
      const floorNode = graph.nodes[0]
      if (cachedScene !== undefined && cachedFloorNode === floorNode) {
        return cachedScene
      }
      cachedScene = buildFramedScene(graph, paint)
      cachedFloorNode = floorNode
      return cachedScene
    },
  }
}
