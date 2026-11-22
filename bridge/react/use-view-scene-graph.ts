import { useMemo, useSyncExternalStore } from 'react'

import type { SceneGraph } from '../../core'
import type { SceneSessionState } from '../scene-session/scene-session-store'

import { useActiveFloorId } from './active-floor-context'
import { useBuildingViewState, type BuildingViewState } from './use-building-view-state'
import { useSceneSessionStoreOrLocal } from './scene-session-context'
import { useSceneGraph } from './use-scene-graph'
import { viewSceneGraph, type ScopedSceneGraph } from './view-scene-graph'

/** The building-view toggles plus the camera mode: the inputs that scope the shown graph. */
type ShownViewSettings = Pick<BuildingViewState, 'scope' | 'showUnderground'> &
  Pick<SceneSessionState, 'cameraMode'>

/**
 * Memoizes the scene graph the 3D view renders for the current scope: the active floor
 * on its own, or the whole building stacked at its elevations (with underground levels
 * dropped when the view hides them, except that a walk keeps the active floor drawn even
 * when its level is hidden). The memo holds the scoped graph stable so the scene rebuilds
 * only when the raw graph, active floor, or view settings change, not on every render
 * (viewSceneGraph returns a fresh object each call).
 */
export function useViewSceneGraph(
  rawGraph: SceneGraph,
  activeFloorId: string | null,
  view: ShownViewSettings,
): ScopedSceneGraph {
  return useMemo(
    () =>
      viewSceneGraph({
        rawGraph,
        scope: view.scope,
        activeFloorId,
        includeUnderground: view.showUnderground,
        cameraMode: view.cameraMode,
      }),
    [rawGraph, activeFloorId, view.scope, view.showUnderground, view.cameraMode],
  )
}

/** The graph the 3D view shows, with the building-view state that scoped it: the raw graph scoped by the active floor and the building view. */
export function useShownSceneGraph(): { graph: ScopedSceneGraph; buildingView: BuildingViewState } {
  const rawGraph = useSceneGraph()
  const activeFloorId = useActiveFloorId()
  const buildingView = useBuildingViewState()
  const store = useSceneSessionStoreOrLocal()
  const { cameraMode } = useSyncExternalStore(store.subscribe, store.getSceneSession)
  const graph = useViewSceneGraph(rawGraph, activeFloorId, { ...buildingView, cameraMode })
  return { graph, buildingView }
}
