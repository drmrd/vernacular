import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { type LightingMode, type SceneGraph, type Site } from '../../core'
import { type EntityScreenPosition } from '../../engine'
import { AmbientOcclusionRenderTakeover } from './ambient-occlusion-render-takeover'
import { effectiveLightingMode } from './effective-lighting-mode'
import { entityLabels } from './entity-labels'
import { useCatalogNames } from './use-catalog-names'
import type { FramedScene } from './framed-scene'
import { FurnitureModelSignals } from './furniture-model-signals'
import { LiveSceneFrameSignal, useFirstFrameReadiness } from './live-scene-frame-signal'
import { LiveSceneRoot } from './live-scene-root'
import { NearWallFade } from './near-wall-fade'
import { OrbitCameraControls } from './orbit-camera-controls'
import { usePerceivedColorStore } from './perceived-color-context'
import { PerceivedColorSampler } from './perceived-color-sampler'
import { RendererMemoryProbe } from './renderer-memory-probe'
import { FrameCamera, PresetCamera, type DoorwayStand } from './scene-camera-effects'
import { initialCamera, orbitPivot } from './scene-camera-seed'
import { SceneRendererCanvas } from './scene-renderer-canvas'
import { SceneLighting } from './scene-lighting'
import { SceneNavToolbar } from './scene-nav-toolbar'
import { ScenePaneShell } from './scene-pane-shell'
import { SceneProxyOverlay } from './scene-proxy-overlay'
import { SceneProxyProjector } from './scene-proxies'
import { sceneReadinessProps } from './scene-readiness'
import { SceneSelection } from './scene-selection'
import { selectionAllowed } from './scene-selection-gate'
import { useSelection, useSelectionIds } from './selection-context'
import type { BuildingViewState } from './use-building-view-state'
import { useDoorwayTarget, type DoorwayTarget } from './use-doorway-target'
import { useFramedScene } from './use-framed-scene'
import { useInteractiveObjects } from './use-interactive-objects'
import { useLiveViewReadiness, type LiveViewReadinessNotes } from './use-live-view-readiness'
import { useFrontDirection } from './use-front-direction'
import { useProjectSite } from './use-project-site'
import { useSceneEnvironment, type SceneEnvironmentState } from './use-scene-environment'
import { useSceneNavigation, type SceneNavigationState } from './use-scene-navigation'
import { WalkCameraControls } from './walk-camera-controls'

// The accessibility proxy state: the live projected screen positions (fed by the in-canvas
// projector), joined with entity labels, plus the shared selection the proxies read and
// write. The positions are session view state, like the camera and color temperature.
// eslint-disable-next-line react-refresh/only-export-components -- the hook ships beside the component that calls it and this slice's test imports useSceneProxies from ./webgpu-scene-view.
export function useSceneProxies(graph: SceneGraph) {
  const [positions, setPositions] = useState<EntityScreenPosition[]>([])
  const selection = useSelection()
  const selectedIds = useSelectionIds()
  const catalogNames = useCatalogNames()
  const labels = useMemo(() => entityLabels(graph, catalogNames), [graph, catalogNames])
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
  doorway: DoorwayStand | null
}

// The camera behaviors of the live canvas, grouped because they all steer the one
// default camera: the automatic model framing, the preset applier, and the orbit and
// walk controls. The navigation state decides which control is active and whether the
// user has taken over from the automatic framing.
function SceneCameraRig({ nav, framed, doorway }: SceneCameraRigProps) {
  const { root, pose, bounds } = framed
  return (
    <>
      <FrameCamera bounds={bounds} active={!nav.userControlled} />
      <PresetCamera
        request={nav.presetRequest}
        bounds={bounds}
        doorway={doorway}
        onApplied={nav.notePresetApplied}
      />
      {/* The pivot follows the framing until the user steers; after that only an applied
          preset moves it, so a rebuild of the scene leaves a panned pivot alone. */}
      <OrbitCameraControls
        enabled={nav.mode === 'orbit'}
        initialTarget={nav.savedCamera?.orbitTarget ?? pose.target}
        target={orbitPivot({
          userControlled: nav.userControlled,
          presetPose: nav.presetPose,
          framedPose: pose,
        })}
        onUserControl={nav.markUserControlled}
        onLeave={nav.noteCameraLeft}
      />
      <WalkCameraControls
        enabled={nav.mode === 'walk'}
        onUserControl={nav.markUserControlled}
        root={root}
        savedWalkPose={nav.walkPose}
        onWalkPose={nav.noteWalkPose}
        storedOpenDoorIds={nav.openDoorIds}
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
  const front = useFrontDirection()
  return (
    <SceneLighting
      colorTemperatureK={colorTemperatureK}
      bounds={bounds}
      realistic={environment.mode === 'realistic'}
      site={site}
      front={front}
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
  doorway: DoorwayStand | null
  onSceneAttached: (scene: FramedScene) => () => void
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

// The scene-graph elements that render inside the Canvas: the scene root, the
// lighting, the selection and proxy wiring, the camera rig, and the ambient-occlusion
// takeover. Grouped apart from LiveSceneCanvas so that function keeps to the Canvas's
// own setup and its two render-order-sensitive post-processing hooks, the same way
// SceneCameraRig and ViewSceneLighting group their own slice of the scene.
function LiveSceneContents(props: LiveSceneCanvasProps & { readiness: LiveViewReadinessNotes }) {
  const { framed, nav, viewEnvironment, site, onProxyPositions, doorway, readiness } = props
  const { root, bounds, nearWallTargets, roomPolygons, buildingTopWorld } = framed
  return (
    <>
      <LiveSceneRoot framed={framed} onAttached={props.onSceneAttached} />
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
      <SceneCameraRig nav={nav} framed={framed} doorway={doorway} />
      <AmbientOcclusionRenderTakeover
        realistic={viewEnvironment.environment.mode === 'realistic'}
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
  // other stored field arrives as a prop of this render. The Canvas is built from both once the
  // renderer module loads, and no frame can count as drawn before that, so readiness never
  // reports a frame drawn without the session.
  useEffect(() => readiness.noteSessionApplied(), [readiness])
  return (
    <SceneReadinessBoundary ready={ready}>
      {/* React Three Fiber overwrites gl.shadowMap.enabled with !!shadows while
          configuring the Canvas, so create-renderer's shadowMap setup goes dead
          without this prop. The bare boolean also selects PCFSoftShadowMap,
          matching create-renderer's intent. */}
      <SceneRendererCanvas
        frameloop="always"
        shadows
        camera={initialCamera(props.framed.pose, props.nav.savedCamera?.position ?? null)}
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
        <RendererMemoryProbe />
      </SceneRendererCanvas>
    </SceneReadinessBoundary>
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
  const interactiveObjects = useInteractiveObjects()
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
      interactiveObjectsAtDefault={interactiveObjects.atDefault}
      onResetInteractiveObjects={interactiveObjects.reset}
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
  const framedScene = useFramedScene()
  const { graph, buildingView, edgeOverlay, toggleEdgeOverlay, framed, modelsVersion } = framedScene
  const nav = useSceneNavigation()
  const viewEnvironment = useSceneEnvironment()
  const site = useProjectSite()
  const { proxies, selectedIds, onSelect, setPositions } = useSceneProxies(graph)
  const doorway = useDoorwayTarget(graph, selectedIds)
  // The toolbar reads the lighting mode resolved from the user's realistic-lighting choice.
  const lightingMode = effectiveLightingMode(viewEnvironment.environment.mode === 'realistic')

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
          doorway={doorway}
          onSceneAttached={framedScene.onSceneAttached}
        />
        <SceneProxyOverlay proxies={proxies} selectedIds={selectedIds} onSelect={onSelect} />
      </ScenePaneShell>
      <FurnitureModelSignals root={framed.root} version={modelsVersion} />
    </div>
  )
}
