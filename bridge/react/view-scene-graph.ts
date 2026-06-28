import type { SceneGraph } from '../../core'

/** Options controlling which floors the whole-building view includes. */
export interface BuildingViewOptions {
  /** Include floors below grade (negative elevation), such as a basement. */
  includeUnderground: boolean
}

/**
 * Projects the whole building into one scene graph: every floor stacked at its own
 * elevation, the unified counterpart to `sceneGraphForFloor`.
 */
export function sceneGraphForBuilding(graph: SceneGraph, options: BuildingViewOptions): SceneGraph {
  if (options.includeUnderground) {
    return graph
  }
  // Dropping the below-grade floors lands with the next behavior.
  return graph
}
