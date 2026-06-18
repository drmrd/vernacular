import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  cameraPresetPose,
  doorwayPose,
  sceneGraphForFloor,
  DEFAULT_COLOR_TEMPERATURE_K,
  type Bounds3,
  type CameraPose,
  type OpeningSceneNode,
  type SceneGraph,
} from '../../core'
import {
  createSceneRenderer,
  updateNearWallTransparency,
  type EntityScreenPosition,
  type NearWallTarget,
  type SceneRoot,
} from '../../engine'
import { useActiveFloorId } from './active-floor-context'
import { CameraControlsHint } from './camera-controls-hint'
import { applyCameraPose, fitCameraToBounds, fovToRadians, type FittableCamera } from './fit-camera'
import { createFramedSceneReconciler } from './framed-scene-reconciler'
import { OrbitCameraControls } from './orbit-camera-controls'
import { SceneLighting } from './scene-lighting'
import { SceneNavToolbar, type NavMode, type PresetChoice } from './scene-nav-toolbar'
import { SceneProxyOverlay } from './scene-proxy-overlay'
import { SceneProxyProjector } from './scene-proxies'
import { SceneSelection } from './scene-selection'
import { useSelection, useSelectionIds } from './selection-context'
import { useFurnitureModelCache } from './use-furniture-model-cache'
import { useProjectPaint } from './use-project-paint'
import { useSceneGraph } from './use-scene-graph'
import { WalkCameraControls } from './walk-camera-controls'

// Frames the camera on the scene bounds, fitting the model to the live canvas
// aspect ratio and field of view (ADR-0075), while the user has not taken control
// of the camera. It reruns when the canvas size changes, so a pane resize or a move
// between full and split view refits the model instead of leaving a stale frame.
// Once the user orbits or walks, `active` goes false and the fit stops being
// applied, so an edit no longer yanks a navigated camera; clearing user control
// (the reset button) makes `active` true again, which reframes. The live Canvas is
// set to frameloop="always" so interactive camera moves render continuously.
function FrameCamera({ bounds, active }: { bounds: Bounds3 | null; active: boolean }) {
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  useLayoutEffect(() => {
    if (!active) return
    fitCameraToBounds(camera, bounds, size)
  }, [camera, bounds, active, size])
  return null
}

// A request to snap the camera to a named preset. The nonce changes on every request
// so re-selecting the same preset re-applies it.
interface PresetRequest {
  preset: PresetChoice
  nonce: number
}

// The live inputs a preset pose needs, captured in a ref so PresetCamera reads the
// latest without the effect re-firing on every change.
interface PresetView {
  bounds: Bounds3 | null
  opening: OpeningSceneNode | null
  size: { width: number; height: number }
  camera: FittableCamera
}

// Derives the pose for a preset request: the doorway view needs the resolved opening
// (none means no pose), and the axis-aligned views fit the live viewport.
function poseForRequest(request: PresetRequest, view: PresetView): CameraPose | null {
  if (view.bounds === null) return null
  if (request.preset === 'doorway') {
    return view.opening === null ? null : doorwayPose(view.opening, view.bounds)
  }
  const aspect = view.size.width / view.size.height
  const fovRadians = fovToRadians(view.camera)
  return cameraPresetPose(request.preset, view.bounds, { aspect, fovRadians })
}

// Snaps the live camera to a preset whenever a new request arrives. It reads the
// latest bounds, opening, size, and camera from a ref so the effect fires only on a
// new request, not on a resize (a resize must not yank the camera onto a preset).
function PresetCamera({
  request,
  bounds,
  opening,
}: {
  request: PresetRequest | null
  bounds: Bounds3 | null
  opening: OpeningSceneNode | null
}) {
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  const latest = useRef<PresetView>({ camera, size, bounds, opening })
  latest.current = { camera, size, bounds, opening }
  useLayoutEffect(() => {
    if (request === null) return
    const pose = poseForRequest(request, latest.current)
    if (pose !== null) applyCameraPose(latest.current.camera, pose)
  }, [request])
  return null
}

// The per-view camera navigation state: the active mode and whether the user has
// taken control of the camera. Session state held in the view layer, never in the
// model or undo. Reset clears user control, which lets FrameCamera refit the model
// to the viewport through its `active` transition.
function useSceneNavigation() {
  const [mode, setMode] = useState<NavMode>('orbit')
  const [userControlled, setUserControlled] = useState(false)
  const [presetRequest, setPresetRequest] = useState<PresetRequest | null>(null)
  const markUserControlled = useCallback(() => setUserControlled(true), [])
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

// Fades the prepared exterior walls each frame from the live camera, so a wall the
// camera is outside of turns transparent and the interior shows through it (issue #122).
// It reads the live camera through useFrame rather than reframing, so it never moves the
// camera; it only sets material opacity.
function NearWallFade({ targets }: { targets: NearWallTarget[] }) {
  useFrame(({ camera }) => updateNearWallTransparency(targets, camera.position))
  return null
}

interface LiveSceneCanvasProps {
  root: SceneRoot
  pose: CameraPose
  bounds: Bounds3 | null
  mode: NavMode
  userControlled: boolean
  onUserControl: () => void
  colorTemperatureK: number
  onProxyPositions: (positions: EntityScreenPosition[]) => void
  opening: OpeningSceneNode | null
  presetRequest: PresetRequest | null
  nearWallTargets: NearWallTarget[]
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
  userControlled,
  onUserControl,
  colorTemperatureK,
  onProxyPositions,
  opening,
  presetRequest,
  nearWallTargets,
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
      <SceneSelection root={root} />
      <SceneProxyProjector root={root} onPositions={onProxyPositions} />
      <FrameCamera bounds={bounds} active={!userControlled} />
      <PresetCamera request={presetRequest} bounds={bounds} opening={opening} />
      <NearWallFade targets={nearWallTargets} />
      <OrbitCameraControls
        enabled={mode === 'orbit'}
        target={pose.target}
        onUserControl={onUserControl}
      />
      <WalkCameraControls enabled={mode === 'walk'} onUserControl={onUserControl} />
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
  // Scope to the active floor and rebuild the scene only when that scoped graph
  // actually changes, not on every render (sceneGraphForFloor returns a fresh object
  // each call). The wholesale rebuild on change is the temporary approach the
  // incremental-update slice replaces (foundation spec 5.5).
  const graph = useMemo(
    () => sceneGraphForFloor(rawGraph, activeFloorId),
    [rawGraph, activeFloorId],
  )
  const paint = useProjectPaint()
  // One reconciler for the life of the view; it reuses an unchanged floor's built
  // scene instead of rebuilding on every edit (foundation spec 5.5).
  const reconcilerRef = useRef(createFramedSceneReconciler())
  const models = useFurnitureModelCache(graph)
  const { root, pose, bounds, nearWallTargets } = useMemo(
    () => reconcilerRef.current.reconcile(graph, paint, models.lookup),
    [graph, paint, models],
  )
  const {
    mode,
    setMode,
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
        onReset={resetView}
        colorTemperatureK={colorTemperatureK}
        onColorTemperatureChange={setColorTemperatureK}
        onPreset={applyPreset}
        canDoorway={doorwayOpening !== null}
      />
      <ScenePaneShell mode={mode}>
        <LiveSceneCanvas
          root={root}
          pose={pose}
          bounds={bounds}
          mode={mode}
          userControlled={userControlled}
          onUserControl={markUserControlled}
          colorTemperatureK={colorTemperatureK}
          onProxyPositions={setPositions}
          opening={doorwayOpening}
          presetRequest={presetRequest}
          nearWallTargets={nearWallTargets}
        />
        <SceneProxyOverlay proxies={proxies} selectedIds={selectedIds} onSelect={onSelect} />
      </ScenePaneShell>
    </div>
  )
}
