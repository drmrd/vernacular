import {
  MIN_COLOR_TEMPERATURE_K,
  MAX_COLOR_TEMPERATURE_K,
  formatColorTemperature,
  colorTemperatureLabel,
} from '../../core'
import type { CameraPreset } from '../../core'

import './scene-nav-toolbar.css'

export type NavMode = 'orbit' | 'walk'

export type PresetChoice = CameraPreset | 'doorway'

const COLOR_TEMPERATURE_STEP_K = 100

/** End captions sourced from core so the warm=low / cool=high convention lives in one place. */
const WARM_CAPTION = capitalize(colorTemperatureLabel(MIN_COLOR_TEMPERATURE_K))
const COOL_CAPTION = capitalize(colorTemperatureLabel(MAX_COLOR_TEMPERATURE_K))

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

const NAV_MODE_BUTTONS: ReadonlyArray<{ label: string; mode: NavMode }> = [
  { label: 'Orbit', mode: 'orbit' },
  { label: 'Walk', mode: 'walk' },
]

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
  selectionEnabled?: boolean
  onToggleSelection?: () => void
  onPreset?: (preset: PresetChoice) => void
  canDoorway?: boolean
}

interface ModeToggleProps {
  mode: NavMode
  onModeChange: (mode: NavMode) => void
}

/** The orbit/walk camera modes as a segmented toggle; the active mode is pressed. */
function ModeToggle({ mode, onModeChange }: ModeToggleProps) {
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

interface SelectionToggleProps {
  selectionEnabled: boolean
  onToggleSelection: () => void
}

/** Click-to-select is opt-in: a pressed toggle reflects whether selecting is currently on. */
function SelectionToggle({ selectionEnabled, onToggleSelection }: SelectionToggleProps) {
  return (
    <button
      type="button"
      className="scene-nav-toolbar__btn"
      aria-pressed={selectionEnabled}
      onClick={onToggleSelection}
    >
      Select
    </button>
  )
}

interface CameraPresetButtonsProps {
  onPreset: ((preset: PresetChoice) => void) | undefined
  canDoorway: boolean | undefined
}

function CameraPresetButtons({ onPreset, canDoorway }: CameraPresetButtonsProps) {
  return (
    <div
      role="group"
      aria-label="Camera presets"
      className="scene-nav-toolbar__presets scene-nav-toolbar__secondary"
    >
      {PRESET_VIEW_BUTTONS.map(({ label, preset }) => (
        <button
          key={preset}
          type="button"
          className="scene-nav-toolbar__btn"
          onClick={() => onPreset?.(preset)}
        >
          {label}
        </button>
      ))}
      <button
        type="button"
        className="scene-nav-toolbar__btn"
        disabled={!canDoorway}
        onClick={() => onPreset?.('doorway')}
      >
        Doorway
      </button>
    </div>
  )
}

interface ColorTemperatureControlProps {
  colorTemperatureK: number
  onColorTemperatureChange: (kelvin: number) => void
}

/**
 * The color-temperature slider with a live Kelvin readout and muted warm/cool end
 * captions. The readout reflects the current value through the core formatter; the slider
 * keeps its existing accessible name and `aria-valuetext` so assistive technology and the
 * scene's e2e coverage continue to resolve it by name.
 */
function ColorTemperatureControl({
  colorTemperatureK,
  onColorTemperatureChange,
}: ColorTemperatureControlProps) {
  return (
    <label className="scene-nav-toolbar__temperature">
      Color temperature
      <span className="scene-nav-toolbar__temperature-end">{WARM_CAPTION}</span>
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
      <span className="scene-nav-toolbar__temperature-end">{COOL_CAPTION}</span>
      <output className="scene-nav-toolbar__temperature-readout">
        {formatColorTemperature(colorTemperatureK)}
      </output>
    </label>
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
  selectionEnabled = false,
  onToggleSelection = () => {},
  onPreset,
  canDoorway,
}: SceneNavToolbarProps) {
  return (
    <div role="toolbar" aria-label="3D navigation" className="scene-nav-toolbar">
      <div className="scene-nav-toolbar__primary">
        <ModeToggle mode={mode} onModeChange={onModeChange} />
        <SelectionToggle
          selectionEnabled={selectionEnabled}
          onToggleSelection={onToggleSelection}
        />
        <button type="button" className="scene-nav-toolbar__btn" onClick={onReset}>
          Reset view
        </button>
      </div>
      <CameraPresetButtons onPreset={onPreset} canDoorway={canDoorway} />
      <div className="scene-nav-toolbar__environment">
        <ColorTemperatureControl
          colorTemperatureK={colorTemperatureK}
          onColorTemperatureChange={onColorTemperatureChange}
        />
      </div>
    </div>
  )
}
