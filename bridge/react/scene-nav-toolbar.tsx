export type NavMode = 'orbit' | 'walk'

interface SceneNavToolbarProps {
  mode: NavMode
  onModeChange: (mode: NavMode) => void
  onReset: () => void
}

/**
 * Navigation chrome for the three-dimensional scene view. It exposes a toggle between
 * the orbit and walk camera modes and a control that returns the camera to its framed
 * starting view. The active mode is reflected through `aria-pressed` so assistive
 * technology announces which way the camera currently moves.
 */
export function SceneNavToolbar({ mode, onModeChange, onReset }: SceneNavToolbarProps) {
  return (
    <div role="toolbar" aria-label="3D navigation" className="scene-nav-toolbar">
      <button type="button" aria-pressed={mode === 'orbit'} onClick={() => onModeChange('orbit')}>
        Orbit
      </button>
      <button type="button" aria-pressed={mode === 'walk'} onClick={() => onModeChange('walk')}>
        Walk
      </button>
      <button type="button" onClick={onReset}>
        Reset view
      </button>
    </div>
  )
}
