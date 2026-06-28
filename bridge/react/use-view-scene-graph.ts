import { useMemo } from 'react'

import type { SceneGraph } from '../../core'

import type { BuildingViewState } from './use-building-view-state'
import { viewSceneGraph } from './view-scene-graph'

/**
 * Memoizes the scene graph the 3D view renders for the current scope: the active floor
 * on its own, or the whole building stacked at its elevations (with underground levels
 * dropped when the view hides them). The memo holds the scoped graph stable so the scene
 * rebuilds only when the raw graph, active floor, or building-view toggles change, not on
 * every render (viewSceneGraph returns a fresh object each call).
 */
export function useViewSceneGraph(
  rawGraph: SceneGraph,
  activeFloorId: string | null,
  view: BuildingViewState,
): SceneGraph {
  return useMemo(
    () =>
      viewSceneGraph({
        rawGraph,
        scope: view.scope,
        activeFloorId,
        includeUnderground: view.showUnderground,
      }),
    [rawGraph, activeFloorId, view.scope, view.showUnderground],
  )
}
