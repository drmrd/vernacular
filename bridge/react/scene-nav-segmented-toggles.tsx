import type { NavMode } from './scene-nav-toolbar'
import type { SceneScope } from './view-scene-graph'

const NAV_MODE_BUTTONS: ReadonlyArray<{ label: string; mode: NavMode }> = [
  { label: 'Orbit', mode: 'orbit' },
  { label: 'Walk', mode: 'walk' },
]

const VIEW_SCOPE_BUTTONS: ReadonlyArray<{ label: string; scope: SceneScope }> = [
  { label: 'This floor', scope: 'floor' },
  { label: 'Whole building', scope: 'building' },
]

interface ScopeToggleProps {
  scope: SceneScope
  onScopeChange: (scope: SceneScope) => void
}

/** Whether the view frames a single floor or the whole building, as a segmented toggle. */
export function ScopeToggle({ scope, onScopeChange }: ScopeToggleProps) {
  return (
    <div role="group" aria-label="View scope" className="scene-nav-toolbar__modes">
      {VIEW_SCOPE_BUTTONS.map(({ label, scope: buttonScope }) => (
        <button
          key={buttonScope}
          type="button"
          className="scene-nav-toolbar__mode"
          aria-pressed={scope === buttonScope}
          onClick={() => onScopeChange(buttonScope)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

interface ModeToggleProps {
  mode: NavMode
  onModeChange: (mode: NavMode) => void
}

/** The orbit/walk camera modes as a segmented toggle; the active mode is pressed. */
export function ModeToggle({ mode, onModeChange }: ModeToggleProps) {
  return (
    <div role="group" aria-label="Camera mode" className="scene-nav-toolbar__modes">
      {NAV_MODE_BUTTONS.map(({ label, mode: buttonMode }) => (
        <button
          key={buttonMode}
          type="button"
          className="scene-nav-toolbar__mode"
          aria-pressed={mode === buttonMode}
          onClick={() => onModeChange(buttonMode)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
