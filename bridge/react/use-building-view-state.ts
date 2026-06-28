import { useCallback, useState } from 'react'

import type { SceneScope } from './view-scene-graph'

/** The 3D view's whole-building session state: its scope and underground visibility. */
export interface BuildingViewState {
  scope: SceneScope
  showUnderground: boolean
  setScope: (scope: SceneScope) => void
  toggleUnderground: () => void
}

/**
 * Per-view session state for the whole-building view (foundation section 5.3), held in
 * the view layer and never in the model or undo. It seeds the active-floor scope with
 * underground levels shown, and exposes a scope setter and an underground toggle for the
 * navigation toolbar.
 */
export function useBuildingViewState(): BuildingViewState {
  const [scope, setScope] = useState<SceneScope>('floor')
  const [showUnderground, setShowUnderground] = useState(true)
  const toggleUnderground = useCallback(() => setShowUnderground((shown) => !shown), [])
  return { scope, showUnderground, setScope, toggleUnderground }
}
