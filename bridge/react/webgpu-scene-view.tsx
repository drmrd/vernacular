import { Canvas, useFrame } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  humanizeElementTypeId,
  type LightingMode,
  type OpeningSceneNode,
  type SceneGraph,
  type Site,
} from '../../core'
import { createSceneRenderer, type EntityScreenPosition } from '../../engine'
import { AmbientOcclusionRenderTakeover } from './ambient-occlusion-render-takeover'
import { CameraControlsHint } from './camera-controls-hint'
import { effectiveLightingMode } from './effective-lighting-mode'
import type { FramedScene } from './framed-scene'
import { FurnitureModelSignals } from './furniture-model-signals'
import { NearWallFade } from './near-wall-fade'
import { OrbitCameraControls } from './orbit-camera-controls'
import { usePerceivedColorStore } from './perceived-color-context'
import { PerceivedColorSampler } from './perceived-color-sampler'
import { FrameCamera, PresetCamera } from './scene-camera-effects'
import { initialCamera } from './scene-camera-seed'
import { SceneLighting } from './scene-lighting'
import { SceneNavToolbar, type NavMode } from './scene-nav-toolbar'
import { SceneProxyOverlay } from './scene-proxy-overlay'
import { SceneProxyProjector } from './scene-proxies'
import { sceneReadinessProps } from './scene-readiness'
import { SceneSelection } from './scene-selection'
import { selectionAllowed } from './scene-selection-gate'
import { useSelection, useSelectionIds } from './selection-context'
import type { BuildingViewState } from './use-building-view-state'
import { useDoorwayTarget, type DoorwayTarget } from './use-doorway-target'
import { useFramedScene } from './use-framed-scene'
import { useLiveViewReadiness, type LiveViewReadinessNotes } from './use-live-view-readiness'
import { useProjectSite } from './use-project-site'
import { useSceneEnvironment, type SceneEnvironmentState } from './use-scene-environment'
import { useSceneNavigation, type SceneNavigationState } from './use-scene-navigation'
import { WalkCameraControls } from './walk-camera-controls'

// Labels the openings in graph order, numbering each within its own element-type
// sequence rather than one shared sequence, so a plan with two doors and one window
// reads "Single Swing Door 1", "Double Hung Window 1", "Single Swing Door 2" instead
// of grouping every opening kind under one running count.
function openingLabels(openings: SceneGraph['openings']): (readonly [string, string])[] {
  const seen = new Map<string, number>()
  return openings.map((opening) => {
    const ordinal = (seen.get(opening.type) ?? 0) + 1
    seen.set(opening.type, ordinal)
    return [opening.id, `${humanizeElementTypeId(opening.type)} ${ordinal}`] as const
  })
}

// A short, stable label per selectable entity for the accessibility proxies, derived from
// the scene graph node kind and a per-kind index ("Wall 1", "Room 2"). Openings label from
// their element type instead of the generic "Opening" kind. Labels live in the bridge layer
// because the three-dimensional overlay cannot import the editor layer.
// eslint-disable-next-line react-refresh/only-export-components -- pure label derivation exported for its unit test, matching the exported helpers beside CameraControlsHint and NearWallFade
export function entityLabels(graph: SceneGraph): Map<string, string> {
  return new Map<string, string>([
    ...graph.walls.map((wall, index) => [wall.id, `Wall ${index + 1}`] as const),
    ...graph.rooms.map((room, index) => [room.id, `Room ${index + 1}`] as const),
    ...openingLabels(graph.openings),
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
      <PresetCamera
        request={nav.presetRequest}
        bounds={bounds}
        opening={opening}
        onApplied={nav.notePresetApplied}
      />
      {/* An applied preset owns the pivot until the view is reset, so the first drag after
          one turns around what the preset framed instead of snapping back to the model's
          own framing. */}
      <OrbitCameraControls
        enabled={nav.mode === 'orbit'}
        target={nav.presetPose?.target ?? pose.target}
        onUserControl={nav.markUserControlled}
        onLeave={nav.noteCameraLeft}
      />
      <WalkCameraControls
        enabled={nav.mode === 'walk'}
        onUserControl={nav.markUserControlled}
        root={root}
        savedWalkPose={nav.walkPose}
        onWalkPose={nav.noteWalkPose}
        savedOpenDoorIds={nav.openDoorIds}
        onOpenDoors={nav.noteOpenDoors}
      />
    </>
  )
}

interface ViewSceneLightingProps {
  viewEnvironment: SceneEnvironmentState
  site: Site | undefined
  bounds: FramedScene['bounds']
}

// Binds the scene lighting rig to the two view inputs: the view-local color temperature
// and the shared environment session. Realistic mode follows the session mode, and the
// observation instant, cloud cover, and color check flow straight through.
function ViewSceneLighting({ viewEnvironment, site, bounds }: ViewSceneLightingProps) {
  const { colorTemperatureK, environment } = viewEnvironment
  return (
    <SceneLighting
      colorTemperatureK={colorTemperatureK}
      bounds={bounds}
      realistic={environment.mode === 'realistic'}
      site={site}
      observedAt={environment.observedAt}
      cloudCover={environment.cloudCover}
      colorCheck={environment.colorCheck}
    />
  )
}

interface LiveSceneCanvasProps {
  framed: FramedScene
  nav: SceneNavigationState
  viewEnvironment: SceneEnvironmentState
  site: Site | undefined
  onProxyPositions: (positions: EntityScreenPosition[]) => void
  opening: OpeningSceneNode | null
}

// Flips once the live canvas has rendered its first frame, mirroring the harness
// canvas's data-harness-ready flip (scene-harness-view.tsx): the wrapper advertises
// it through sceneReadinessProps so the editor pane's readiness observer knows the
// scene has actually drawn, not merely mounted.
function useFirstFrameReadiness() {
  const [ready, setReady] = useState(false)
  const handleFirstFrame = useCallback(() => setReady(true), [])
  return { ready, handleFirstFrame }
}

// After AO_RENDER_PRIORITY (1) and SAMPLE_PRIORITY (2), so this fires once the frame is actually fully drawn.
const FRAME_SIGNAL_PRIORITY = 3

// Reports each drawn frame to the two readers that wait on one. The scene-readiness boundary
// cares about the first frame alone, so the ref guard keeps every later frame from re-invoking
// onFirstFrame. The live-view readiness fact re-arms instead: a pipeline build clears it and the
// first frame after that build settles has to set it again, so onDrawnFrame fires every frame.
function LiveSceneFrameSignal({
  onFirstFrame,
  onDrawnFrame,
}: {
  onFirstFrame: () => void
  onDrawnFrame: () => void
}) {
  const firedRef = useRef(false)
  useFrame(() => {
    onDrawnFrame()
    if (firedRef.current) return
    firedRef.current = true
    onFirstFrame()
  }, FRAME_SIGNAL_PRIORITY)
  return null
}

// The wrapper carries the shared readiness props (scene-readiness.ts) so the editor
// pane's observer can tell, from outside the bridge layer, when the canvas inside has
// drawn its first frame. It fills its flex-item parent the same way React Three
// Fiber's own Canvas wrapper div would if it were the direct child here.
function SceneReadinessBoundary({ ready, children }: { ready: boolean; children: ReactNode }) {
  return (
    <div style={{ width: '100%', height: '100%' }} {...sceneReadinessProps(ready)}>
      {children}
    </div>
  )
}

// The scene-graph elements that render inside the Canvas: the keyed primitive, the
// lighting, the selection and proxy wiring, the camera rig, and the ambient-occlusion
// takeover. Grouped apart from LiveSceneCanvas so that function keeps to the Canvas's
// own setup and its two render-order-sensitive post-processing hooks, the same way
// SceneCameraRig and ViewSceneLighting group their own slice of the scene.
function LiveSceneContents(props: LiveSceneCanvasProps & { readiness: LiveViewReadinessNotes }) {
  const { framed, nav, viewEnvironment, site, onProxyPositions, opening, readiness } = props
  const { root, bounds, nearWallTargets, roomPolygons, buildingTopWorld } = framed
  return (
    <>
      {/* Key the primitive on the rebuilt group so a new scene replaces the old one:
          React Three Fiber does not re-attach a <primitive> when its object prop
          changes in place, only when the element remounts. */}
      <primitive key={root.uuid} object={root} />
      <ViewSceneLighting viewEnvironment={viewEnvironment} site={site} bounds={bounds} />
      <SceneSelection
        root={root}
        enabled={selectionAllowed({ enabled: nav.selectionEnabled, mode: nav.mode })}
      />
      <SceneProxyProjector root={root} onPositions={onProxyPositions} />
      <NearWallFade
        targets={nearWallTargets}
        enabled={nav.mode === 'orbit' && nav.revealInterior}
        roomPolygons={roomPolygons}
        buildingTopWorld={buildingTopWorld}
      />
      <SceneCameraRig nav={nav} framed={framed} opening={opening} />
      <AmbientOcclusionRenderTakeover
        realistic={viewEnvironment.environment.mode === 'realistic'}
        site={site}
        onPipelineBuildStarted={readiness.notePipelineBuildStarted}
        onPipelineSettled={readiness.notePipelineSettled}
      />
    </>
  )
}

// The interactive React Three Fiber canvas: the WebGPU renderer setup, the readiness
// boundary around it, and the two post-processing hooks that must stay directly under
// this function (they need the perceived-color store and first-frame callback that
// live here). Extracted from WebGPUSceneView so each function stays within the length
// limit. frameloop="always" renders every frame so interactive camera moves and
// color-temperature changes show continuously, not only when React remounts the scene.
// Props arrive unflattened (the navigation state travels whole, as it does into
// SceneViewToolbar) and pass straight through to LiveSceneContents.
function LiveSceneCanvas(props: LiveSceneCanvasProps) {
  const perceivedColor = usePerceivedColorStore()
  const { ready, handleFirstFrame } = useFirstFrameReadiness()
  const readiness = useLiveViewReadiness()
  // The stored session reaches the live view as the Canvas below is constructed: initialCamera
  // seeds the camera with the position the departing viewer left behind (ADR-0170), and every
  // other stored field arrives as a prop of this render. By the time this effect runs the
  // Canvas has been built from both, so the session has been applied.
  useEffect(() => readiness.noteSessionApplied(), [readiness])
  return (
    <SceneReadinessBoundary ready={ready}>
      {/* React Three Fiber overwrites gl.shadowMap.enabled with !!shadows while
          configuring the Canvas, so create-renderer's shadowMap setup goes dead
          without this prop. The bare boolean also selects PCFSoftShadowMap,
          matching create-renderer's intent. */}
      <Canvas
        frameloop="always"
        shadows
        camera={initialCamera(props.framed.pose, props.nav.savedCameraPosition)}
        // React Three Fiber's web Canvas always supplies an HTMLCanvasElement here
        // (the OffscreenCanvas branch of DefaultGLProps applies only to its worker
        // path), so narrowing the cast away from OffscreenCanvas is safe.
        gl={(defaultProps) =>
          createSceneRenderer({ canvas: defaultProps.canvas as HTMLCanvasElement })
        }
      >
        <LiveSceneContents {...props} readiness={readiness} />
        {/* The sampler must live inside the Canvas because it reads the drawing
            buffer from within the per-frame callback, and it runs at a later
            frame priority than the ambient-occlusion takeover in LiveSceneContents
            so it reads a frame that has already been drawn and composited. */}
        <PerceivedColorSampler store={perceivedColor} />
        <LiveSceneFrameSignal
          onFirstFrame={handleFirstFrame}
          onDrawnFrame={readiness.noteFrameDrawn}
        />
      </Canvas>
    </SceneReadinessBoundary>
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

// The camera pane's floor within the preview column: even when the nav toolbar above it
// wraps onto every row it has, the canvas keeps at least this share of the column's height
// (issue #457). The toolbar carries min-height: 0 and overflow-y: auto in
// scene-nav-toolbar.css so it shrinks to whatever share this leaves it and scrolls
// internally instead of pushing the canvas below a usable size.
export const CAMERA_PANE_MIN_HEIGHT_SHARE = '55%'

// The interactive preview pane: it wraps the canvas and overlay (passed as children), shows
// the grab/grabbing cursor that signals the canvas is draggable, and overlays the per-mode
// controls hint. The hint is inert to pointer events, so it never blocks a drag.
export function ScenePaneShell({ mode, children }: { mode: NavMode; children: ReactNode }) {
  const { dragging, paneHandlers } = useDragging()
  return (
    <div
      className="scene-camera-pane"
      style={{
        position: 'relative',
        flex: 1,
        minHeight: CAMERA_PANE_MIN_HEIGHT_SHARE,
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
  viewEnvironment: SceneEnvironmentState
  doorway: DoorwayTarget | null
  lightingMode: LightingMode
}

// Feeds the navigation toolbar from the view's grouped session state: the camera
// navigation, the building-view scope, the edge-overlay display option, and the
// view-local color temperature, plus whether the doorway preset has a target. The
// toolbar's own props stay flat so it can be exercised in isolation. The shared
// environment session (observation instant, cloud cover) is still written by the editor's
// Environment panel; the toolbar sees only the two fields that decide whether the
// color-temperature slider reaches the render, the effective lighting mode and the color
// check.
function SceneViewToolbar({
  nav,
  buildingView,
  edgeOverlay,
  onToggleEdgeOverlay,
  viewEnvironment,
  doorway,
  lightingMode,
}: SceneViewToolbarProps) {
  return (
    <SceneNavToolbar
      mode={nav.mode}
      onModeChange={nav.setMode}
      lightingMode={lightingMode}
      colorCheck={viewEnvironment.environment.colorCheck}
      selectionEnabled={nav.selectionEnabled}
      onToggleSelection={nav.toggleSelection}
      revealInterior={nav.revealInterior}
      onToggleRevealInterior={nav.toggleRevealInterior}
      onReset={nav.resetView}
      colorTemperatureK={viewEnvironment.colorTemperatureK}
      onColorTemperatureChange={viewEnvironment.setColorTemperatureK}
      onPreset={nav.applyPreset}
      doorway={doorway}
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
  const viewEnvironment = useSceneEnvironment()
  const site = useProjectSite()
  const { proxies, selectedIds, onSelect, setPositions } = useSceneProxies(graph)
  const doorway = useDoorwayTarget(graph.openings, selectedIds)
  // The toolbar reads the mode the render resolves to, not the requested one, so a
  // realistic request without a site location keeps the schematic controls live.
  const lightingMode = effectiveLightingMode(viewEnvironment.environment.mode === 'realistic', site)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <SceneViewToolbar
        nav={nav}
        buildingView={buildingView}
        edgeOverlay={edgeOverlay}
        onToggleEdgeOverlay={toggleEdgeOverlay}
        viewEnvironment={viewEnvironment}
        doorway={doorway}
        lightingMode={lightingMode}
      />
      <ScenePaneShell mode={nav.mode}>
        <LiveSceneCanvas
          framed={framed}
          nav={nav}
          viewEnvironment={viewEnvironment}
          site={site}
          onProxyPositions={setPositions}
          opening={doorway?.opening ?? null}
        />
        <SceneProxyOverlay proxies={proxies} selectedIds={selectedIds} onSelect={onSelect} />
      </ScenePaneShell>
      <FurnitureModelSignals root={framed.root} version={modelsVersion} />
    </div>
  )
}
