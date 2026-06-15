import type { SceneGraph, SurfaceTreatment } from '../../core'
import { buildFramedScene, type FramedScene } from './framed-scene'

export interface FramedSceneReconciler {
  reconcile(graph: SceneGraph, paint?: Record<string, SurfaceTreatment>): FramedScene
}

/**
 * Caches a single built FramedScene keyed by the active floor's id so that a repeated
 * reconcile of the same floor returns the same FramedScene reference without rebuilding.
 */
export function createFramedSceneReconciler(): FramedSceneReconciler {
  let cachedFloorId: string | undefined
  let cachedScene: FramedScene | undefined

  return {
    reconcile(graph, paint = {}) {
      const floorId = graph.nodes[0]?.id
      if (cachedScene !== undefined && cachedFloorId === floorId) {
        return cachedScene
      }
      cachedScene = buildFramedScene(graph, paint)
      cachedFloorId = floorId
      return cachedScene
    },
  }
}
