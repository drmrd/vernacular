import { useMemo, useSyncExternalStore } from 'react'

import {
  sceneSessionSetter,
  sceneSessionToggle,
  useSceneSessionStoreOrLocal,
} from './scene-session-context'
import type { SceneScope } from './view-scene-graph'

/** The 3D view's whole-building session state: its scope and underground visibility. */
export interface BuildingViewState {
  scope: SceneScope
  showUnderground: boolean
  setScope: (scope: SceneScope) => void
  toggleUnderground: () => void
}

/**
 * Per-view session state for the whole-building view (foundation section 5.3). The state lives
 * in the scene session store, so it outlasts the preview subtree's unmount when the view mode
 * changes (ADR-0170), and it stays out of the model and undo history whichever store backs it.
 * It seeds the active-floor scope with underground levels shown, and exposes a scope setter and
 * an underground toggle for the navigation toolbar.
 */
export function useBuildingViewState(): BuildingViewState {
  const store = useSceneSessionStoreOrLocal()
  const session = useSyncExternalStore(store.subscribe, store.getSceneSession)
  const writers = useMemo(
    () => ({
      setScope: sceneSessionSetter(store, 'scope'),
      toggleUnderground: sceneSessionToggle(store, 'showUnderground'),
    }),
    [store],
  )
  return {
    scope: session.scope,
    showUnderground: session.showUnderground,
    setScope: writers.setScope,
    toggleUnderground: writers.toggleUnderground,
  }
}
