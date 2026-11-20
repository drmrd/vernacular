import { useMemo, useSyncExternalStore } from 'react'

import type { SceneGraph } from '../../core'

import { useActiveFloorId } from './active-floor-context'
import { useBuildingViewState, type BuildingViewState } from './use-building-view-state'
import { useSceneSessionStoreOrLocal } from './scene-session-context'
import { useSceneGraph } from './use-scene-graph'
import { viewSceneGraph } from './view-scene-graph'

/**
 * Memoizes the scene graph the 3D view renders for the current scope: the active floor
 * on its own, or the whole building stacked at its elevations (with underground levels
 * dropped when the view hides them). The memo holds the scoped graph stable so the scene
 * rebuilds only when the raw graph, active floor, camera mode, or building-view toggles change, not on
 * every render (viewSceneGraph returns a fresh object each call).
 */
export function useViewSceneGraph(
  rawGraph: SceneGraph,
  activeFloorId: string | null,
  view: BuildingViewState,
): SceneGraph {
  const store = useSceneSessionStoreOrLocal()
  const { cameraMode } = useSyncExternalStore(store.subscribe, store.getSceneSession)
  return useMemo(
    () =>
      viewSceneGraph({
        rawGraph,
        scope: view.scope,
        activeFloorId,
        includeUnderground: view.showUnderground,
        cameraMode,
      }),
    [rawGraph, activeFloorId, view.scope, view.showUnderground, cameraMode],
  )
}

/** The graph the 3D view shows, with the building-view state that scoped it: the raw graph scoped by the active floor and the building view. */
export function useShownSceneGraph(): { graph: SceneGraph; buildingView: BuildingViewState } {
  const rawGraph = useSceneGraph()
  const activeFloorId = useActiveFloorId()
  const buildingView = useBuildingViewState()
  return { graph: useViewSceneGraph(rawGraph, activeFloorId, buildingView), buildingView }
}
