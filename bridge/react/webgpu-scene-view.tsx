import { Canvas } from '@react-three/fiber'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import {
  DEFAULT_COLOR_TEMPERATURE_K,
  DEFAULT_OBSERVATION_INSTANT,
  type ObservationInstant,
  type OpeningSceneNode,
  type SceneGraph,
  type Site,
} from '../../core'
import { createSceneRenderer, type EntityScreenPosition } from '../../engine'
import { CameraControlsHint } from './camera-controls-hint'
import type { FramedScene } from './framed-scene'
import { FurnitureModelSignals } from './furniture-model-signals'
import { NearWallFade } from './near-wall-fade'
import { OrbitCameraControls } from './orbit-camera-controls'
import { FrameCamera, PresetCamera, type PresetRequest } from './scene-camera-effects'
import { SceneLighting } from './scene-lighting'
import { SceneNavToolbar, type NavMode, type PresetChoice } from './scene-nav-toolbar'
import { SceneProxyOverlay } from './scene-proxy-overlay'
import { SceneProxyProjector } from './scene-proxies'
import { SceneSelection } from './scene-selection'
import { selectionAllowed } from './scene-selection-gate'
import { useSelection, useSelectionIds } from './selection-context'
import type { BuildingViewState } from './use-building-view-state'
import { useFramedScene } from './use-framed-scene'
import { useProjectSite } from './use-project-site'
import { WalkCameraControls } from './walk-camera-controls'

// The per-view camera navigation state: the active mode and whether the user has
// taken control of the camera. Session state held in the view layer, never in the
// model or undo. Reset clears user control, which lets FrameCamera refit the model
// to the viewport through its `active` transition.
function useSceneNavigation() {
  const [mode, setMode] = useState<NavMode>('orbit')
  const [selectionEnabled, setSelectionEnabled] = useState(false)
  const [revealInterior, setRevealInterior] = useState(true)
  const [userControlled, setUserControlled] = useState(false)
  const [presetRequest, setPresetRequest] = useState<PresetRequest | null>(null)
  const markUserControlled = useCallback(() => setUserControlled(true), [])
  const toggleSelection = useCallback(() => setSelectionEnabled((value) => !value), [])
  const toggleRevealInterior = useCallback(() => setRevealInterior((value) => !value), [])
  // Reset leaves the last presetRequest in place on purpose: a stale request cannot
  // re-fire because PresetCamera's effect depends on the request's identity, which does
  // not change on reset.
  const resetView = useCallback(() => setUserControlled(false), [])
  // Applying a preset takes camera control (so the framing does not override it) and
  // bumps the nonce so PresetCamera reapplies even when the same preset is re-picked.
  const applyPreset = useCallback((preset: PresetChoice) => {
    setUserControlled(true)
    setPresetRequest((previous) => ({ preset, nonce: (previous?.nonce ?? 0) + 1 }))
  }, [])
  return {
    mode,
    setMode,
    selectionEnabled,
    toggleSelection,
    revealInterior,
    toggleRevealInterior,
    userControlled,
    markUserControlled,
    resetView,
    presetRequest,
    applyPreset,
  }
}

// The grouped result of useSceneNavigation, so the toolbar wiring can take the whole
// navigation state as one prop instead of re-listing each field.
type SceneNavigationState = ReturnType<typeof useSceneNavigation>

// Per-view color-temperature session state, held in the view component (foundation
// section 5.3), never in the model or undo. It feeds the toolbar slider and, once
// wired, the scene lighting.
function useColorTemperature() {
  const [colorTemperatureK, setColorTemperatureK] = useState(DEFAULT_COLOR_TEMPERATURE_K)
  return { colorTemperatureK, setColorTemperatureK }
}

// Per-view observation date/time session state, held in the view component (foundation
// section 5.3), never in the model or undo. It feeds the toolbar readout and, under
// realistic lighting, drives the solar sun.
function useObservationDateTime() {
  const [observationInstant, setObservationInstant] = useState<ObservationInstant>(
    DEFAULT_OBSERVATION_INSTANT,
  )
  return { observationInstant, setObservationInstant }
}

// Per-view realistic-lighting session state, held in the view component (foundation
// section 5.3), never in the model or undo. It feeds the display-options toggle and
// selects the scene's lighting provider (solar when on and the site has a location).
function useRealisticLighting() {
  const [realisticLighting, setRealisticLighting] = useState(false)
  const toggleRealisticLighting = useCallback(() => setRealisticLighting((value) => !value), [])
  return { realisticLighting, toggleRealisticLighting }
}

// The grouped per-view environment session state (color temperature, observation
// date/time, and the realistic-lighting mode), so the toolbar and canvas wiring take
// it as one prop, the same way the navigation state travels.
function useEnvironmentSession() {
  const { colorTemperatureK, setColorTemperatureK } = useColorTemperature()
  const { observationInstant, setObservationInstant } = useObservationDateTime()
  const { realisticLighting, toggleRealisticLighting } = useRealisticLighting()
  return {
    colorTemperatureK,
    setColorTemperatureK,
    observationInstant,
    setObservationInstant,
    realisticLighting,
    toggleRealisticLighting,
  }
}

// The grouped result of useEnvironmentSession, so the toolbar and canvas wiring can
// take the whole environment state as one prop instead of re-listing each field.
type EnvironmentSessionState = ReturnType<typeof useEnvironmentSession>

// A short, stable label per selectable entity for the accessibility proxies, derived from
// the scene graph node kind and a per-kind index ("Wall 1", "Room 2"). Labels live in the
// bridge layer because the three-dimensional overlay cannot import the editor layer.
function entityLabels(graph: SceneGraph): Map<string, string> {
  return new Map<string, string>([
    ...graph.walls.map((wall, index) => [wall.id, `Wall ${index + 1}`] as const),
    ...graph.rooms.map((room, index) => [room.id, `Room ${index + 1}`] as const),
    ...graph.openings.map((opening, index) => [opening.id, `Opening ${index + 1}`] as const),
  ])
}

// The accessibility proxy state: the live projected screen positions (fed by the in-canvas
// projector), joined with entity labels, plus the shared selection the proxies read and
// write. The positions are session view state, like the camera and color temperature.
function useSceneProxies(graph: SceneGraph) {
  const [positions, setPositions] = useState<EntityScreenPosition[]>([])
  const selection = useSelection()
  const selectedIds = useSelectionIds()
  const labels = useMemo(() => entityLabels(graph), [graph])
  const proxies = useMemo(
    () => positions.map((p) => ({ id: p.id, x: p.x, y: p.y, label: labels.get(p.id) ?? p.id })),
    [positions, labels],
  )
  const onSelect = useCallback(
    (id: string, additive: boolean) => (additive ? selection.toggle(id) : selection.select(id)),
    [selection],
  )
  return { proxies, selectedIds, onSelect, setPositions }
}

// Resolves the opening the doorway preset frames: the selected one when an opening is
// selected, otherwise the first opening on the active floor (none disables the control).
function useDoorwayOpening(
  openings: OpeningSceneNode[],
  selectedIds: ReadonlySet<string>,
): OpeningSceneNode | null {
  return useMemo(() => {
    const selected = openings.find((entry) => selectedIds.has(entry.id))
    return selected ?? openings[0] ?? null
  }, [openings, selectedIds])
}

interface SceneCameraRigProps {
  nav: SceneNavigationState
  framed: FramedScene
  opening: OpeningSceneNode | null
}

// The camera behaviors of the live canvas, grouped because they all steer the one
// default camera: the automatic model framing, the preset applier, and the orbit and
// walk controls. The navigation state decides which control is active and whether the
// user has taken over from the automatic framing.
function SceneCameraRig({ nav, framed, opening }: SceneCameraRigProps) {
  const { root, pose, bounds } = framed
  return (
    <>
      <FrameCamera bounds={bounds} active={!nav.userControlled} />
      <PresetCamera request={nav.presetRequest} bounds={bounds} opening={opening} />
      <OrbitCameraControls
        enabled={nav.mode === 'orbit'}
        target={pose.target}
        onUserControl={nav.markUserControlled}
      />
      <WalkCameraControls
        enabled={nav.mode === 'walk'}
        onUserControl={nav.markUserControlled}
        root={root}
      />
    </>
  )
}

interface LiveSceneCanvasProps {
  framed: FramedScene
  nav: SceneNavigationState
  environment: EnvironmentSessionState
  site: Site | undefined
  onProxyPositions: (positions: EntityScreenPosition[]) => void
  opening: OpeningSceneNode | null
}

// The interactive React Three Fiber canvas: the keyed scene primitive, the lighting,
// the selection and proxy wiring, and the camera rig. Extracted from WebGPUSceneView
// so each function stays within the length limit. frameloop="always" renders every frame
// so interactive camera moves and color-temperature changes show continuously, not only
// when React remounts the scene. Props arrive unflattened (the navigation state travels
// whole, as it does into SceneViewToolbar) and are destructured in the body.
function LiveSceneCanvas(props: LiveSceneCanvasProps) {
  const { framed, nav, environment, site, onProxyPositions, opening } = props
  const { root, pose, bounds, nearWallTargets, roomPolygons } = framed
  return (
    <Canvas
      frameloop="always"
      camera={{
        position: [pose.position.x, pose.position.y, pose.position.z],
        near: pose.near,
        far: pose.far,
      }}
      // React Three Fiber's web Canvas always supplies an HTMLCanvasElement here
      // (the OffscreenCanvas branch of DefaultGLProps applies only to its worker
      // path), so narrowing the cast away from OffscreenCanvas is safe.
      gl={(defaultProps) =>
        createSceneRenderer({ canvas: defaultProps.canvas as HTMLCanvasElement })
      }
    >
      {/* Key the primitive on the rebuilt group so a new scene replaces the old one:
          React Three Fiber does not re-attach a <primitive> when its object prop
          changes in place, only when the element remounts. */}
      <primitive key={root.uuid} object={root} />
      <SceneLighting
        colorTemperatureK={environment.colorTemperatureK}
        bounds={bounds}
        realistic={environment.realisticLighting}
        site={site}
        observedAt={environment.observationInstant}
      />
      <SceneSelection
        root={root}
        enabled={selectionAllowed({ enabled: nav.selectionEnabled, mode: nav.mode })}
      />
      <SceneProxyProjector root={root} onPositions={onProxyPositions} />
      <NearWallFade
        targets={nearWallTargets}
        enabled={nav.mode === 'orbit' && nav.revealInterior}
        roomPolygons={roomPolygons}
      />
      <SceneCameraRig nav={nav} framed={framed} opening={opening} />
    </Canvas>
  )
}

// Tracks whether a pointer drag is underway on the preview pane so the cursor can switch
// between grab and grabbing. Native canvas pointer events bubble to the pane wrapper, so
// an orbit or look drag flips this; pointer up or leaving the pane clears it.
function useDragging() {
  const [dragging, setDragging] = useState(false)
  const start = useCallback(() => setDragging(true), [])
  const stop = useCallback(() => setDragging(false), [])
  return {
    dragging,
    paneHandlers: { onPointerDown: start, onPointerUp: stop, onPointerLeave: stop },
  }
}

// The interactive preview pane: it wraps the canvas and overlay (passed as children), shows
// the grab/grabbing cursor that signals the canvas is draggable, and overlays the per-mode
// controls hint. The hint is inert to pointer events, so it never blocks a drag.
function ScenePaneShell({ mode, children }: { mode: NavMode; children: ReactNode }) {
  const { dragging, paneHandlers } = useDragging()
  return (
    <div
      className="scene-camera-pane"
      style={{
        position: 'relative',
        flex: 1,
        minHeight: 0,
        cursor: dragging ? 'grabbing' : 'grab',
      }}
      {...paneHandlers}
    >
      {children}
      <CameraControlsHint mode={mode} />
    </div>
  )
}

interface SceneViewToolbarProps {
  nav: SceneNavigationState
  buildingView: BuildingViewState
  edgeOverlay: boolean
  onToggleEdgeOverlay: () => void
  environment: EnvironmentSessionState
  canDoorway: boolean
}

// Feeds the navigation toolbar from the view's grouped session state: the camera
// navigation, the building-view scope, the edge-overlay display option, and the
// environment settings, plus whether the doorway preset has a target. The toolbar's
// own props stay flat so it can be exercised in isolation.
function SceneViewToolbar({
  nav,
  buildingView,
  edgeOverlay,
  onToggleEdgeOverlay,
  environment,
  canDoorway,
}: SceneViewToolbarProps) {
  return (
    <SceneNavToolbar
      mode={nav.mode}
      onModeChange={nav.setMode}
      selectionEnabled={nav.selectionEnabled}
      onToggleSelection={nav.toggleSelection}
      revealInterior={nav.revealInterior}
      onToggleRevealInterior={nav.toggleRevealInterior}
      onReset={nav.resetView}
      colorTemperatureK={environment.colorTemperatureK}
      onColorTemperatureChange={environment.setColorTemperatureK}
      observationInstant={environment.observationInstant}
      onObservationChange={environment.setObservationInstant}
      realisticLighting={environment.realisticLighting}
      onToggleRealisticLighting={environment.toggleRealisticLighting}
      onPreset={nav.applyPreset}
      canDoorway={canDoorway}
      scope={buildingView.scope}
      onScopeChange={buildingView.setScope}
      showUnderground={buildingView.showUnderground}
      onToggleUnderground={buildingView.toggleUnderground}
      edgeOverlay={edgeOverlay}
      onToggleEdgeOverlay={onToggleEdgeOverlay}
    />
  )
}

// Mounts the React Three Fiber canvas with the WebGPU renderer, with a navigation toolbar
// above it and the accessibility proxy overlay beside it. It is rendered only when WebGPU
// is available, so it never executes under jsdom; the renderer is constructed in the engine
// layer. The framed-scene wiring lives in useFramedScene, which subscribes to the live
// scene graph scoped to the active floor, so the pane rebuilds and reframes as the plan
// is edited.
export function WebGPUSceneView() {
  const { graph, buildingView, edgeOverlay, toggleEdgeOverlay, framed, modelsVersion } =
    useFramedScene()
  const nav = useSceneNavigation()
  const environment = useEnvironmentSession()
  const site = useProjectSite()
  const { proxies, selectedIds, onSelect, setPositions } = useSceneProxies(graph)
  const doorwayOpening = useDoorwayOpening(graph.openings, selectedIds)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <SceneViewToolbar
        nav={nav}
        buildingView={buildingView}
        edgeOverlay={edgeOverlay}
        onToggleEdgeOverlay={toggleEdgeOverlay}
        environment={environment}
        canDoorway={doorwayOpening !== null}
      />
      <ScenePaneShell mode={nav.mode}>
        <LiveSceneCanvas
          framed={framed}
          nav={nav}
          environment={environment}
          site={site}
          onProxyPositions={setPositions}
          opening={doorwayOpening}
        />
        <SceneProxyOverlay proxies={proxies} selectedIds={selectedIds} onSelect={onSelect} />
      </ScenePaneShell>
      <FurnitureModelSignals root={framed.root} version={modelsVersion} />
    </div>
  )
}
