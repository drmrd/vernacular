import { Canvas } from '@react-three/fiber'
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  DEFAULT_COLOR_TEMPERATURE_K,
  type Bounds3,
  type CameraPose,
  type OpeningSceneNode,
  type Point,
  type SceneGraph,
} from '../../core'
import {
  createSceneRenderer,
  type EntityScreenPosition,
  type NearWallTarget,
  type SceneRoot,
} from '../../engine'
import { useActiveFloorId } from './active-floor-context'
import { CameraControlsHint } from './camera-controls-hint'
import { createFramedSceneReconciler } from './framed-scene-reconciler'
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
import { useFurnitureModelCache } from './use-furniture-model-cache'
import { useBuildingViewState } from './use-building-view-state'
import { useProjectPaint } from './use-project-paint'
import { useSceneGraph } from './use-scene-graph'
import { useViewSceneGraph } from './use-view-scene-graph'
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

// Per-view color-temperature session state, held in the view component (foundation
// section 5.3), never in the model or undo. It feeds the toolbar slider and, once
// wired, the scene lighting.
function useColorTemperature() {
  const [colorTemperatureK, setColorTemperatureK] = useState(DEFAULT_COLOR_TEMPERATURE_K)
  return { colorTemperatureK, setColorTemperatureK }
}

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

interface LiveSceneCanvasProps {
  root: SceneRoot
  pose: CameraPose
  bounds: Bounds3 | null
  mode: NavMode
  selectionEnabled: boolean
  revealInterior: boolean
  userControlled: boolean
  onUserControl: () => void
  colorTemperatureK: number
  onProxyPositions: (positions: EntityScreenPosition[]) => void
  opening: OpeningSceneNode | null
  presetRequest: PresetRequest | null
  nearWallTargets: NearWallTarget[]
  roomPolygons: readonly (readonly Point[])[]
}

// The interactive React Three Fiber canvas: the keyed scene primitive, the framed
// camera, the lighting, and the orbit and walk controls. Extracted from WebGPUSceneView
// so each function stays within the length limit. frameloop="always" renders every frame
// so interactive camera moves and color-temperature changes show continuously, not only
// when React remounts the scene.
function LiveSceneCanvas({
  root,
  pose,
  bounds,
  mode,
  selectionEnabled,
  revealInterior,
  userControlled,
  onUserControl,
  colorTemperatureK,
  onProxyPositions,
  opening,
  presetRequest,
  nearWallTargets,
  roomPolygons,
}: LiveSceneCanvasProps) {
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
      <SceneLighting colorTemperatureK={colorTemperatureK} bounds={bounds} />
      <SceneSelection root={root} enabled={selectionAllowed({ enabled: selectionEnabled, mode })} />
      <SceneProxyProjector root={root} onPositions={onProxyPositions} />
      <FrameCamera bounds={bounds} active={!userControlled} />
      <PresetCamera request={presetRequest} bounds={bounds} opening={opening} />
      <NearWallFade
        targets={nearWallTargets}
        enabled={mode === 'orbit' && revealInterior}
        roomPolygons={roomPolygons}
      />
      <OrbitCameraControls
        enabled={mode === 'orbit'}
        target={pose.target}
        onUserControl={onUserControl}
      />
      <WalkCameraControls enabled={mode === 'walk'} onUserControl={onUserControl} root={root} />
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

// Mounts the React Three Fiber canvas with the WebGPU renderer, with a navigation toolbar
// above it and the accessibility proxy overlay beside it. It is rendered only when WebGPU
// is available, so it never executes under jsdom; the renderer is constructed in the engine
// layer. The pane subscribes to the live scene graph scoped to the active floor, so it
// rebuilds and reframes as the plan is edited.
export function WebGPUSceneView() {
  const rawGraph = useSceneGraph()
  const activeFloorId = useActiveFloorId()
  const buildingView = useBuildingViewState()
  // Scope to the active floor or the whole building stacked at its elevations (issue
  // #206); the scoped graph is memoized so the scene rebuilds only when it changes.
  const graph = useViewSceneGraph(rawGraph, activeFloorId, buildingView)
  const paint = useProjectPaint()
  // One reconciler for the life of the view; it reuses an unchanged floor's built
  // scene instead of rebuilding on every edit (foundation spec 5.5).
  const reconcilerRef = useRef(createFramedSceneReconciler())
  const models = useFurnitureModelCache(graph)
  const { root, pose, bounds, nearWallTargets, roomPolygons } = useMemo(
    () => reconcilerRef.current.reconcile(graph, paint, models.lookup),
    [graph, paint, models],
  )
  const {
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
  } = useSceneNavigation()
  const { colorTemperatureK, setColorTemperatureK } = useColorTemperature()
  const { proxies, selectedIds, onSelect, setPositions } = useSceneProxies(graph)
  const doorwayOpening = useDoorwayOpening(graph.openings, selectedIds)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <SceneNavToolbar
        mode={mode}
        onModeChange={setMode}
        selectionEnabled={selectionEnabled}
        onToggleSelection={toggleSelection}
        revealInterior={revealInterior}
        onToggleRevealInterior={toggleRevealInterior}
        onReset={resetView}
        colorTemperatureK={colorTemperatureK}
        onColorTemperatureChange={setColorTemperatureK}
        onPreset={applyPreset}
        canDoorway={doorwayOpening !== null}
        scope={buildingView.scope}
        onScopeChange={buildingView.setScope}
        showUnderground={buildingView.showUnderground}
        onToggleUnderground={buildingView.toggleUnderground}
      />
      <ScenePaneShell mode={mode}>
        <LiveSceneCanvas
          root={root}
          pose={pose}
          bounds={bounds}
          mode={mode}
          selectionEnabled={selectionEnabled}
          revealInterior={revealInterior}
          userControlled={userControlled}
          onUserControl={markUserControlled}
          colorTemperatureK={colorTemperatureK}
          onProxyPositions={setPositions}
          opening={doorwayOpening}
          presetRequest={presetRequest}
          nearWallTargets={nearWallTargets}
          roomPolygons={roomPolygons}
        />
        <SceneProxyOverlay proxies={proxies} selectedIds={selectedIds} onSelect={onSelect} />
      </ScenePaneShell>
      <FurnitureModelSignals root={root} version={models.version} />
    </div>
  )
}
