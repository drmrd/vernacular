import {
  MIN_COLOR_TEMPERATURE_K,
  MAX_COLOR_TEMPERATURE_K,
  formatColorTemperature,
  colorTemperatureLabel,
  DEFAULT_OBSERVATION_INSTANT,
  formatObservationDateTime,
  observationInstantToIso,
  parseObservationInstant,
} from '../../core'
import type { CameraPreset, ObservationInstant } from '../../core'

import type { SceneScope } from './view-scene-graph'

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

const VIEW_SCOPE_BUTTONS: ReadonlyArray<{ label: string; scope: SceneScope }> = [
  { label: 'This floor', scope: 'floor' },
  { label: 'Whole building', scope: 'building' },
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
  observationInstant?: ObservationInstant
  onObservationChange?: (instant: ObservationInstant) => void
  selectionEnabled?: boolean
  onToggleSelection?: () => void
  revealInterior?: boolean
  onToggleRevealInterior?: () => void
  onPreset?: (preset: PresetChoice) => void
  canDoorway?: boolean
  scope?: SceneScope
  onScopeChange?: (scope: SceneScope) => void
  showUnderground?: boolean
  onToggleUnderground?: () => void
}

interface ScopeToggleProps {
  scope: SceneScope
  onScopeChange: (scope: SceneScope) => void
}

/** Whether the view frames a single floor or the whole building, as a segmented toggle. */
function ScopeToggle({ scope, onScopeChange }: ScopeToggleProps) {
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

interface ToolbarToggleProps {
  label: string
  pressed: boolean
  onToggle: () => void
  disabled?: boolean
}

/**
 * A single pressable toolbar action. The label doubles as the accessible name, `pressed`
 * drives `aria-pressed`, and an omitted `disabled` leaves the button enabled.
 */
function ToolbarToggle({ label, pressed, onToggle, disabled }: ToolbarToggleProps) {
  return (
    <button
      type="button"
      className="scene-nav-toolbar__btn"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onToggle}
    >
      {label}
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

interface ObservationDateTimeControlProps {
  observationInstant: ObservationInstant
  onObservationChange: (instant: ObservationInstant) => void
}

/**
 * The observation date/time scrubber with a live readout. Session view state only: it shows
 * the instant and reports changes, and does not drive the lighting yet.
 */
function ObservationDateTimeControl({
  observationInstant,
  onObservationChange,
}: ObservationDateTimeControlProps) {
  return (
    <label className="scene-nav-toolbar__observation">
      Observation date and time
      <input
        type="datetime-local"
        value={observationInstantToIso(observationInstant)}
        aria-label="Observation date and time"
        onChange={(event) => onObservationChange(parseObservationInstant(event.target.value))}
      />
      <output className="scene-nav-toolbar__observation-readout">
        {formatObservationDateTime(observationInstant)}
      </output>
    </label>
  )
}

interface EnvironmentControlsProps {
  colorTemperatureK: number
  onColorTemperatureChange: (kelvin: number) => void
  observationInstant: ObservationInstant
  onObservationChange: (instant: ObservationInstant) => void
}

/**
 * The environment group: the color-temperature slider paired with the observation
 * date/time scrubber, gathered into one section of the toolbar.
 */
function EnvironmentControls({
  colorTemperatureK,
  onColorTemperatureChange,
  observationInstant,
  onObservationChange,
}: EnvironmentControlsProps) {
  return (
    <div className="scene-nav-toolbar__environment">
      <ColorTemperatureControl
        colorTemperatureK={colorTemperatureK}
        onColorTemperatureChange={onColorTemperatureChange}
      />
      <ObservationDateTimeControl
        observationInstant={observationInstant}
        onObservationChange={onObservationChange}
      />
    </div>
  )
}

interface PrimaryClusterProps {
  scope: SceneScope
  onScopeChange: (scope: SceneScope) => void
  showUnderground: boolean
  onToggleUnderground: () => void
  mode: NavMode
  onModeChange: (mode: NavMode) => void
  selectionEnabled: boolean
  onToggleSelection: () => void
  revealInterior: boolean
  onToggleRevealInterior: () => void
  onReset: () => void
}

/**
 * The primary navigation tier: the view-scope toggle and its underground control, the
 * orbit/walk camera modes, click-to-select, the reveal-interior toggle (which sits between
 * select and reset), and the reset action, gathered into one tight cluster so they read as
 * the dominant controls.
 */
function PrimaryCluster(props: PrimaryClusterProps) {
  return (
    <div className="scene-nav-toolbar__primary">
      <ScopeToggle scope={props.scope} onScopeChange={props.onScopeChange} />
      {/*
        Shows or hides the building's below-grade levels (a basement). It applies only to the
        whole-building view, so it is disabled in the active-floor scope; a pressed toggle
        means the underground levels are currently in the model.
      */}
      <ToolbarToggle
        label="Underground levels"
        pressed={props.showUnderground}
        onToggle={props.onToggleUnderground}
        disabled={props.scope === 'floor'}
      />
      <ModeToggle mode={props.mode} onModeChange={props.onModeChange} />
      {/* Click-to-select is opt-in: a pressed toggle reflects whether selecting is currently on. */}
      <ToolbarToggle
        label="Select"
        pressed={props.selectionEnabled}
        onToggle={props.onToggleSelection}
      />
      {/* The near-wall fade defaults on because that is the expected-always-on state; a pressed
          toggle reflects whether it is currently on. */}
      <ToolbarToggle
        label="Reveal interior"
        pressed={props.revealInterior}
        onToggle={props.onToggleRevealInterior}
      />
      <button type="button" className="scene-nav-toolbar__btn" onClick={props.onReset}>
        Reset view
      </button>
    </div>
  )
}

/**
 * Navigation chrome for the three-dimensional scene view. It exposes a toggle between
 * viewing the active floor and the whole building stacked (with a control to show or
 * hide underground levels such as a basement), a toggle between the orbit and walk
 * camera modes, a control that returns the camera to its framed starting view, and a
 * group of camera presets (a top-down view, the four elevations, and a view from a
 * doorway). Pressed states are reflected through `aria-pressed` so assistive technology
 * announces the active view and camera mode.
 */
export function SceneNavToolbar({
  mode,
  onModeChange,
  onReset,
  colorTemperatureK,
  onColorTemperatureChange,
  observationInstant = DEFAULT_OBSERVATION_INSTANT,
  onObservationChange = () => {},
  selectionEnabled = false,
  onToggleSelection = () => {},
  revealInterior = true,
  onToggleRevealInterior = () => {},
  onPreset,
  canDoorway,
  scope = 'floor',
  onScopeChange = () => {},
  showUnderground = true,
  onToggleUnderground = () => {},
}: SceneNavToolbarProps) {
  return (
    <div role="toolbar" aria-label="3D navigation" className="scene-nav-toolbar">
      <PrimaryCluster
        scope={scope}
        onScopeChange={onScopeChange}
        showUnderground={showUnderground}
        onToggleUnderground={onToggleUnderground}
        mode={mode}
        onModeChange={onModeChange}
        selectionEnabled={selectionEnabled}
        onToggleSelection={onToggleSelection}
        revealInterior={revealInterior}
        onToggleRevealInterior={onToggleRevealInterior}
        onReset={onReset}
      />
      <CameraPresetButtons onPreset={onPreset} canDoorway={canDoorway} />
      <EnvironmentControls
        colorTemperatureK={colorTemperatureK}
        onColorTemperatureChange={onColorTemperatureChange}
        observationInstant={observationInstant}
        onObservationChange={onObservationChange}
      />
    </div>
  )
}
