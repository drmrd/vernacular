import { MIN_COLOR_TEMPERATURE_K, MAX_COLOR_TEMPERATURE_K } from '../../core'

export type NavMode = 'orbit' | 'walk'

const COLOR_TEMPERATURE_STEP_K = 100

interface SceneNavToolbarProps {
  mode: NavMode
  onModeChange: (mode: NavMode) => void
  onReset: () => void
  colorTemperatureK: number
  onColorTemperatureChange: (kelvin: number) => void
}

/**
 * Navigation chrome for the three-dimensional scene view. It exposes a toggle between
 * the orbit and walk camera modes and a control that returns the camera to its framed
 * starting view. The active mode is reflected through `aria-pressed` so assistive
 * technology announces which way the camera currently moves.
 */
export function SceneNavToolbar({
  mode,
  onModeChange,
  onReset,
  colorTemperatureK,
  onColorTemperatureChange,
}: SceneNavToolbarProps) {
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
      <label className="scene-nav-toolbar__temperature">
        Color temperature
        <input
          type="range"
          min={MIN_COLOR_TEMPERATURE_K}
          max={MAX_COLOR_TEMPERATURE_K}
          step={COLOR_TEMPERATURE_STEP_K}
          value={colorTemperatureK}
          aria-label="Color temperature"
          aria-valuetext={`${colorTemperatureK} kelvin`}
          onChange={(event) => onColorTemperatureChange(Number(event.target.value))}
        />
      </label>
    </div>
  )
}
