import type { CameraPreset, LightingMode } from '../../core'

import { EnvironmentControls } from './environment-controls'
import { SceneDisplayOptions } from './scene-display-options'
import type { SceneScope } from './view-scene-graph'

import './scene-nav-toolbar.css'

export type NavMode = 'orbit' | 'walk'

export type PresetChoice = CameraPreset | 'doorway'

/**
 * The door the Doorway preset would frame: what to call it, and whether it is there because
 * the user selected it rather than because it was the first door found. Absent (null) means
 * the view holds no door at all, which is the one case that disables the preset outright.
 *
 * `DoorwayTarget` in use-doorway-target.ts is what the live view actually passes here. The
 * two are matched structurally rather than by a shared import, so the meaning of these
 * fields has to be changed in both places at once.
 */
type DoorwayChoice = { name: string; selected: boolean }

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
  doorway?: DoorwayChoice | null
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
  title?: string | undefined
}

/**
 * A single pressable toolbar action. The label doubles as the accessible name (button
 * content outranks `title` in the accessible-name calculation, so the hover text explains
 * without renaming), `pressed` drives `aria-pressed`, and an omitted `disabled` leaves the
 * button enabled.
 */
function ToolbarToggle({ label, pressed, onToggle, disabled, title }: ToolbarToggleProps) {
  return (
    <button
      type="button"
      className="scene-nav-toolbar__btn"
      aria-pressed={pressed}
      disabled={disabled}
      title={title}
      onClick={onToggle}
    >
      {label}
    </button>
  )
}

/**
 * Whether the walk camera is the one driving the view. Walk mode rewrites the camera every
 * frame and treats a canvas click as mouse-look, so every control that steers the orbit
 * camera or an orbit-only render pass reaches nothing until the view returns to orbit. One
 * predicate for the whole toolbar, so the clusters cannot drift apart on which controls go
 * inert. It stays unexported because `react-refresh/only-export-components` reserves this
 * file's exports for components; the matching render gates read `mode` directly.
 */
function walkCameraDriving(mode: NavMode): boolean {
  return mode === 'walk'
}

/**
 * Hover text for the controls that only reach the render under the orbit camera. Each names
 * what it steers, so a walk-mode user reads why it sits inert instead of assuming it broke.
 */
const ORBIT_ONLY_TITLES = {
  select: 'Picks with the orbit camera. A walk-mode click engages mouse-look instead.',
  revealInterior:
    'Thins the walls between the orbit camera and the rooms. Walk mode is already inside them.',
  preset: 'Poses the orbit camera. Walk mode would overwrite the pose on the next frame.',
  resetView:
    'Refits the orbit camera to the model. Walk mode would overwrite the framing on the next frame.',
} as const

/**
 * Shown when the view holds no door. The preset stands the camera in the opening and looks
 * inward, which only reads as a doorway for a door, so a plan of windows leaves it nothing
 * to frame. It names the fix rather than only reporting the block.
 */
const NO_DOORWAY_TITLE =
  'No door in view to frame. Add a door, or show the floor its doors are on, to use this preset.'

/** No door in the view, the one state that disables the Doorway preset on its own. */
function doorwayMissing(doorway: DoorwayChoice | null | undefined): doorway is null | undefined {
  return doorway === null || doorway === undefined
}

/**
 * What the Doorway preset will frame, or why it can frame nothing. Walk mode answers first
 * because it overrides every camera control; a missing door answers next because it is the
 * harder block to guess at; otherwise the text names the door so the user knows which of a
 * plan's doors the camera is about to stand in.
 */
function doorwayTitle(doorway: DoorwayChoice | null | undefined, inertInWalk: boolean): string {
  if (inertInWalk) return ORBIT_ONLY_TITLES.preset
  if (doorwayMissing(doorway)) return NO_DOORWAY_TITLE
  if (doorway.selected) return `Frames the view from inside the ${doorway.name} you selected.`
  return `Frames the view from inside the first ${doorway.name} in view.`
}

interface CameraPresetButtonsProps {
  onPreset: ((preset: PresetChoice) => void) | undefined
  doorway: DoorwayChoice | null | undefined
  mode: NavMode
}

function CameraPresetButtons({ onPreset, doorway, mode }: CameraPresetButtonsProps) {
  const inertInWalk = walkCameraDriving(mode)
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
          disabled={inertInWalk}
          title={inertInWalk ? ORBIT_ONLY_TITLES.preset : undefined}
          onClick={() => onPreset?.(preset)}
        >
          {label}
        </button>
      ))}
      {/* Doorway answers to two reasons rather than the five fixed presets' one: the walk
          camera driving, and a view holding no door to stand in. Its hover text is resolved
          alongside its own `disabled` so the two reasons stay paired with the text that
          explains them, and it speaks even when enabled, because which door the preset picks
          is not something the button's label can show. */}
      <button
        type="button"
        className="scene-nav-toolbar__btn"
        disabled={inertInWalk || doorwayMissing(doorway)}
        title={doorwayTitle(doorway, inertInWalk)}
        onClick={() => onPreset?.('doorway')}
      >
        Doorway
      </button>
    </div>
  )
}

interface ResetViewButtonProps {
  mode: NavMode
  onReset: () => void
}

/** Returns the camera to the framed starting view it opened on. */
function ResetViewButton({ mode, onReset }: ResetViewButtonProps) {
  const inertInWalk = walkCameraDriving(mode)
  return (
    <button
      type="button"
      className="scene-nav-toolbar__btn"
      disabled={inertInWalk}
      title={inertInWalk ? ORBIT_ONLY_TITLES.resetView : undefined}
      onClick={onReset}
    >
      Reset view
    </button>
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
  const inertInWalk = walkCameraDriving(props.mode)
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
        disabled={inertInWalk}
        title={inertInWalk ? ORBIT_ONLY_TITLES.select : undefined}
      />
      {/* The near-wall fade defaults on because that is the expected-always-on state; a pressed
          toggle reflects whether it is currently on. */}
      <ToolbarToggle
        label="Reveal interior"
        pressed={props.revealInterior}
        onToggle={props.onToggleRevealInterior}
        disabled={inertInWalk}
        title={inertInWalk ? ORBIT_ONLY_TITLES.revealInterior : undefined}
      />
      <ResetViewButton mode={props.mode} onReset={props.onReset} />
    </div>
  )
}

/** The optional toolbar props that carry a stand-in when a caller omits them. */
type DefaultedToolbarProps = Required<
  Pick<
    SceneNavToolbarProps,
    | 'lightingMode'
    | 'colorCheck'
    | 'selectionEnabled'
    | 'onToggleSelection'
    | 'revealInterior'
    | 'onToggleRevealInterior'
    | 'scope'
    | 'onScopeChange'
    | 'showUnderground'
    | 'onToggleUnderground'
  >
>

/**
 * The stand-ins themselves, applied by spread rather than by per-parameter initializers:
 * a default per parameter counts as a branch, which pushed the toolbar over the
 * complexity budget as the prop list grew.
 */
const TOOLBAR_DEFAULTS: DefaultedToolbarProps = {
  lightingMode: 'schematic',
  colorCheck: false,
  selectionEnabled: false,
  onToggleSelection: () => {},
  revealInterior: true,
  onToggleRevealInterior: () => {},
  scope: 'floor',
  onScopeChange: () => {},
  showUnderground: true,
  onToggleUnderground: () => {},
}

/** The toolbar props with every defaulted one resolved to a value. */
type ResolvedToolbarProps = SceneNavToolbarProps & DefaultedToolbarProps

/** The toolbar's four clusters, in reading order: primary, presets, display, environment. */
function ToolbarClusters(props: ResolvedToolbarProps) {
  return (
    <>
      <PrimaryCluster
        scope={props.scope}
        onScopeChange={props.onScopeChange}
        showUnderground={props.showUnderground}
        onToggleUnderground={props.onToggleUnderground}
        mode={props.mode}
        onModeChange={props.onModeChange}
        selectionEnabled={props.selectionEnabled}
        onToggleSelection={props.onToggleSelection}
        revealInterior={props.revealInterior}
        onToggleRevealInterior={props.onToggleRevealInterior}
        onReset={props.onReset}
      />
      <CameraPresetButtons onPreset={props.onPreset} doorway={props.doorway} mode={props.mode} />
      <SceneDisplayOptions
        edgeOverlay={props.edgeOverlay}
        onToggleEdgeOverlay={props.onToggleEdgeOverlay}
      />
      <EnvironmentControls
        colorTemperatureK={props.colorTemperatureK}
        onColorTemperatureChange={props.onColorTemperatureChange}
        lightingMode={props.lightingMode}
        colorCheck={props.colorCheck}
      />
    </>
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
export function SceneNavToolbar(props: SceneNavToolbarProps) {
  return (
    <div role="toolbar" aria-label="3D navigation" className="scene-nav-toolbar">
      <ToolbarClusters {...TOOLBAR_DEFAULTS} {...props} />
    </div>
  )
}
