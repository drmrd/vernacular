import { MIN_COLOR_TEMPERATURE_K, MAX_COLOR_TEMPERATURE_K } from '../../core'
import type { CameraPreset } from '../../core'

export type NavMode = 'orbit' | 'walk'

export type PresetChoice = CameraPreset | 'doorway'

const COLOR_TEMPERATURE_STEP_K = 100

const PRESET_VIEW_BUTTONS: ReadonlyArray<{ label: string; preset: CameraPreset }> = [
  { label: 'Top down', preset: 'top' },
  { label: 'North', preset: 'north' },
  { label: 'South', preset: 'south' },
  { label: 'East', preset: 'east' },
  { label: 'West', preset: 'west' },
]

interface SceneNavToolbarProps {
  mode: NavMode
  onModeChange: (mode: NavMode) => void
  onReset: () => void
  colorTemperatureK: number
  onColorTemperatureChange: (kelvin: number) => void
  onPreset?: (preset: PresetChoice) => void
  canDoorway?: boolean
}

interface CameraPresetButtonsProps {
  onPreset: ((preset: PresetChoice) => void) | undefined
  canDoorway: boolean | undefined
}

function CameraPresetButtons({ onPreset, canDoorway }: CameraPresetButtonsProps) {
  return (
    <div role="group" aria-label="Camera presets" className="scene-nav-toolbar__presets">
      {PRESET_VIEW_BUTTONS.map(({ label, preset }) => (
        <button key={preset} type="button" onClick={() => onPreset?.(preset)}>
          {label}
        </button>
      ))}
      <button type="button" disabled={!canDoorway} onClick={() => onPreset?.('doorway')}>
        Doorway
      </button>
    </div>
  )
}

/**
 * Navigation chrome for the three-dimensional scene view. It exposes a toggle between
 * the orbit and walk camera modes, a control that returns the camera to its framed
 * starting view, and a group of camera presets (a top-down view, the four elevations,
 * and a view from a doorway). The active mode is reflected through `aria-pressed` so
 * assistive technology announces which way the camera currently moves.
 */
export function SceneNavToolbar({
  mode,
  onModeChange,
  onReset,
  colorTemperatureK,
  onColorTemperatureChange,
  onPreset,
  canDoorway,
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
      <CameraPresetButtons onPreset={onPreset} canDoorway={canDoorway} />
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
