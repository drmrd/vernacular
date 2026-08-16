import type { CameraPreset, LightingMode } from '../../core'

import { EnvironmentControls } from './environment-controls'
import { SceneDisplayOptions } from './scene-display-options'
import type { SceneScope } from './view-scene-graph'

import './scene-nav-toolbar.css'

export type NavMode = 'orbit' | 'walk'

export type PresetChoice = CameraPreset | 'doorway'

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
  // The mode the view actually renders in, not the requested one, so a realistic request
  // that fell back to schematic keeps the color-temperature slider live.
  lightingMode?: LightingMode
  colorCheck?: boolean
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
  edgeOverlay?: boolean
  onToggleEdgeOverlay?: () => void
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
 * camera modes, a control that returns the camera to its framed starting view, a
 * group of camera presets (a top-down view, the four elevations, and a view from a
 * doorway), and a display-options group holding the surface-edge overlay toggle.
 * Pressed states are reflected through `aria-pressed` so assistive technology
 * announces the active view and camera mode.
 */
export function SceneNavToolbar({
  mode,
  onModeChange,
  onReset,
  colorTemperatureK,
  onColorTemperatureChange,
  lightingMode = 'schematic',
  colorCheck = false,
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
  edgeOverlay,
  onToggleEdgeOverlay,
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
      <SceneDisplayOptions edgeOverlay={edgeOverlay} onToggleEdgeOverlay={onToggleEdgeOverlay} />
      <EnvironmentControls
        colorTemperatureK={colorTemperatureK}
        onColorTemperatureChange={onColorTemperatureChange}
        lightingMode={lightingMode}
        colorCheck={colorCheck}
      />
    </div>
  )
}
