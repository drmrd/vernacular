import { type LightingMode } from '../../core'
import { SceneNavToolbar } from './scene-nav-toolbar'
import type { BuildingViewState } from './use-building-view-state'
import type { DoorwayTarget } from './use-doorway-target'
import { useInteractiveObjects } from './use-interactive-objects'
import type { SceneEnvironmentState } from './use-scene-environment'
import type { SceneNavigationState } from './use-scene-navigation'

export interface SceneViewToolbarProps {
  nav: SceneNavigationState
  buildingView: BuildingViewState
  edgeOverlay: boolean
  onToggleEdgeOverlay: () => void
  viewEnvironment: SceneEnvironmentState
  doorway: DoorwayTarget | null
  lightingMode: LightingMode
}

// Feeds the navigation toolbar from the view's grouped session state: the camera
// navigation, the building-view scope, the edge-overlay display option, and the
// view-local color temperature, plus whether the doorway preset has a target. The
// toolbar's own props stay flat so it can be exercised in isolation. The shared
// environment session (observation instant, cloud cover) is still written by the editor's
// Environment panel; the toolbar sees only the two fields that decide whether the
// color-temperature slider reaches the render, the effective lighting mode and the color
// check.
export function SceneViewToolbar({
  nav,
  buildingView,
  edgeOverlay,
  onToggleEdgeOverlay,
  viewEnvironment,
  doorway,
  lightingMode,
}: SceneViewToolbarProps) {
  const interactiveObjects = useInteractiveObjects()
  return (
    <SceneNavToolbar
      mode={nav.mode}
      onModeChange={nav.setMode}
      lightingMode={lightingMode}
      colorCheck={viewEnvironment.environment.colorCheck}
      selectionEnabled={nav.selectionEnabled}
      onToggleSelection={nav.toggleSelection}
      revealInterior={nav.revealInterior}
      onToggleRevealInterior={nav.toggleRevealInterior}
      onReset={nav.resetView}
      colorTemperatureK={viewEnvironment.colorTemperatureK}
      onColorTemperatureChange={viewEnvironment.setColorTemperatureK}
      onPreset={nav.applyPreset}
      doorway={doorway}
      scope={buildingView.scope}
      onScopeChange={buildingView.setScope}
      showUnderground={buildingView.showUnderground}
      onToggleUnderground={buildingView.toggleUnderground}
      edgeOverlay={edgeOverlay}
      onToggleEdgeOverlay={onToggleEdgeOverlay}
      interactiveObjectsAtDefault={interactiveObjects.atDefault}
      onResetInteractiveObjects={interactiveObjects.reset}
    />
  )
}
