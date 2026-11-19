import { useThree } from '@react-three/fiber'
import { useCallback, useLayoutEffect, useMemo, useState } from 'react'
import { drawOnNextRendererFrame } from '../../engine'
import {
  DEFAULT_COLOR_TEMPERATURE_K,
  frontDirection,
  type Bounds3,
  type CameraPose,
  type ObservationInstant,
  type PlanDirection,
  type Site,
  type SurfaceTreatment,
} from '../../core'
import { ADJACENT_ROOMS_CAMERA_POSE } from './adjacent-rooms-fixture'
import { applyCameraPose, fitCameraToBounds } from './fit-camera'
import { buildFramedScene } from './framed-scene'
import { HARNESS_FIXTURES, type HarnessScene } from './harness-fixtures'
import {
  harnessReadyProps,
  type HarnessReadyFrame,
  type HarnessRenderer,
} from './scene-harness-ready-frame'
import { harnessStateKey } from './scene-harness-state-key'
import { SceneLighting } from './scene-lighting'
import { SceneRendererCanvas } from './scene-renderer-canvas'
import { ambientOcclusionActiveFor, useAmbientOcclusion } from './use-ambient-occlusion'

// Re-exported so the fixtures' own module owns the geometry while every existing
// import path (the bridge index, and thus app/) keeps resolving HarnessScene here.
export type { HarnessScene }

// Deterministic fixture canvas size, pinned so the committed baseline is pixel-stable
// across runs and machines. Kept small to keep the baseline PNG lightweight.
const HARNESS_WIDTH = 320
const HARNESS_HEIGHT = 240

// An opaque clear color so the rendered frame is a real, non-transparent render rather
// than a blank alpha=0 canvas.
const HARNESS_BACKGROUND = 0x1b2a3a

// The paint of a state that names none, held once so the memoized fixture build keeps its
// identity across re-renders instead of rebuilding the scene for a fresh empty object.
const NO_PAINT: Record<string, SurfaceTreatment> = {}

/**
 * How to place the harness camera before rendering: fit the scene `bounds` to the
 * pinned canvas, unless a state supplies its own `cameraOverride` pose (the
 * adjacent-rooms below-datum vantage), in which case snap to that pose instead.
 */
interface HarnessFraming {
  bounds: Bounds3 | null
  cameraOverride: CameraPose | undefined
  // Whether this state's static frame draws through the ambient-occlusion pass; false leaves
  // it on the plain gl.render draw, so schematic states render as before.
  ambientOcclusionActive: boolean
}

// harnessReady: the lighting and the ambient occlusion are settled, so the next draw is the
// ready frame; drawnReadyFrame: that frame was drawn in the renderer's animation loop.
interface HarnessReadiness {
  harnessReady: boolean
  drawnReadyFrame: HarnessReadyFrame | null
  handleLightingReady: () => void
  handleAmbientOcclusionSettled: () => void
  handleReadyFrameDrawn: (frame: HarnessReadyFrame) => void
}

function StaticFrame({
  framing,
  readiness,
}: {
  framing: HarnessFraming
  readiness: HarnessReadiness
}) {
  const { harnessReady, handleAmbientOcclusionSettled, handleReadyFrameDrawn } = readiness
  const { bounds, cameraOverride, ambientOcclusionActive } = framing
  const { gl, scene, camera } = useThree()
  const width = useThree((state) => state.size.width)
  const height = useThree((state) => state.size.height)
  // The same render seam the live view uses: when the ambient-occlusion pass is active the
  // frame draws through it, otherwise straight through gl.render, so a state without the
  // pass renders exactly as before. handleAmbientOcclusionSettled bubbles the
  // build's settlement up so the wrapper's ready gate waits for the installed pipeline.
  const renderFrame = useAmbientOcclusion(ambientOcclusionActive, handleAmbientOcclusionSettled)
  // The camera is placed in this layout effect. The draw runs once, in the renderer's next
  // animation-loop callback, because the renderer resets its counts and does its
  // once-in-a-frame work only there; the cleanup cancels a pending draw. A frame requested
  // with harnessReady true reports itself as the ready frame.
  useLayoutEffect(() => {
    if (cameraOverride === undefined) fitCameraToBounds(camera, bounds, { width, height })
    else applyCameraPose(camera, cameraOverride)
    // gl is typed as the scene library's own renderer, which does not declare the
    // animation-loop accessors the WebGPU renderer has, hence the double cast.
    const renderer = gl as unknown as HarnessRenderer
    return drawOnNextRendererFrame(renderer, () => {
      renderFrame(gl, scene, camera)
      // The renderer reset both counts at the start of this callback, so they are this frame's.
      const { frameCalls, drawCalls } = renderer.info.render
      if (harnessReady) handleReadyFrameDrawn({ renderCalls: frameCalls, drawCalls })
    })
  }, [
    renderFrame,
    gl,
    scene,
    camera,
    bounds,
    cameraOverride,
    width,
    height,
    harnessReady,
    handleReadyFrameDrawn,
  ])
  return null
}

/**
 * A canonical environment override for the harness: a site, an observation instant,
 * the realistic-lighting flag, and the optional cloud-cover fraction and color-check
 * flag that some named states set. Structurally matches the app layer's named
 * environment states without the bridge importing from app/.
 */
export interface HarnessEnvironment {
  site: Site
  observedAt: ObservationInstant
  realistic: boolean
  cloudCover?: number
  colorCheck?: boolean
  // The pose a named environment state supplies when the standing auto-frame would
  // not expose its subject (an interior view through a window). It structurally
  // matches the app layer's HarnessEnvironmentState.cameraPose without the bridge
  // importing from app/.
  cameraPose?: CameraPose
}

/**
 * The single place the harness camera is chosen. Precedence: a named environment
 * state's own `cameraPose` (an interior view through a window) wins; failing that, a
 * per-geometry override (the adjacent-rooms view of the shared slab underside from
 * below the floor datum, which the standing auto-frame does not show, ADR-0150);
 * failing both, undefined, so the state auto-frames its own bounds. Every other
 * geometry frames its own bounds.
 */
// eslint-disable-next-line react-refresh/only-export-components -- the pure camera resolver ships beside the component that frames with it and this slice's test imports resolveHarnessCameraPose from ./scene-harness-view
export function resolveHarnessCameraPose(
  scene: HarnessScene,
  environment?: HarnessEnvironment,
): CameraPose | undefined {
  const geometryOverride = scene === 'adjacent-rooms' ? ADJACENT_ROOMS_CAMERA_POSE : undefined
  return environment?.cameraPose ?? geometryOverride
}

// Forwards the canonical environment override, when present, so its site,
// observation instant, cloud cover, and color-check flag drive the realistic solar
// provider. Without one, SceneLighting's own schematic defaults apply (realistic
// off, no site). The front comes from the fixture's own scene graph, the same input the
// live view gives the sun. The readiness callback bubbles up so the harness can render its
// captured frame only after asynchronous lighting (the lazy sky) has attached.
function HarnessLighting({
  colorTemperatureK,
  bounds,
  front,
  environment,
  onReady,
}: {
  colorTemperatureK: number
  bounds: Bounds3 | null
  front: PlanDirection
  environment?: HarnessEnvironment | undefined
  onReady: () => void
}) {
  return (
    <SceneLighting
      colorTemperatureK={colorTemperatureK}
      bounds={bounds}
      realistic={environment?.realistic}
      site={environment?.site}
      front={front}
      observedAt={environment?.observedAt}
      cloudCover={environment?.cloudCover}
      colorCheck={environment?.colorCheck}
      onReady={onReady}
    />
  )
}

/**
 * A deterministic, test-only three-dimensional render harness. It boots the same
 * scene-plus-basic-lighting pipeline production uses against a fixed wall-shell fixture,
 * pins the canvas size, uses a fixed opaque background, forces the WebGL 2 backend, and
 * renders a single static frame. The Playwright visual baseline screenshots this canvas.
 * It is mounted only when the `?fixture=scene-harness` query parameter is present (see
 * the App), so a normal page load never reaches it.
 */
interface SceneHarnessViewProps {
  // Admits undefined (not just absent) so the App can forward an optional query
  // parameter under exactOptionalPropertyTypes; the default applies either way.
  colorTemperatureK?: number | undefined
  paint?: Record<string, SurfaceTreatment> | undefined
  scene?: HarnessScene | undefined
  environment?: HarnessEnvironment | undefined
}

// The framed pose as the Canvas camera props: the fitted position with the near and
// far planes the framing computed (ADR-0075).
function harnessCameraProps(pose: CameraPose) {
  return {
    position: [pose.position.x, pose.position.y, pose.position.z] as [number, number, number],
    near: pose.near,
    far: pose.far,
  }
}

// Flips once the lighting provider's asynchronous resources (the lazy sky) attach.
// The wrapper advertises it through SCENE_READY_ATTRIBUTE, which the visual specs await
// before screenshotting. The ready frame is drawn in the renderer's animation loop, and
// React commits the attribute in the commit after it (see useHarnessReadiness), so an
// observable "true" implies the frame exists.
function useHarnessLightingReadiness() {
  const [lightingReady, setLightingReady] = useState(false)
  const handleLightingReady = useCallback(() => setLightingReady(true), [])
  return { lightingReady, handleLightingReady }
}

// Flips once the ambient-occlusion pipeline build settles (install, stale-discard, or
// failure all count, mirroring the sky slice's settled-not-succeeded contract) so a failed
// build cannot hang the capture. Only meaningful when the pass is active for the state.
function useHarnessAmbientOcclusionReadiness() {
  const [ambientOcclusionSettled, setAmbientOcclusionSettled] = useState(false)
  const handleAmbientOcclusionSettled = useCallback(() => setAmbientOcclusionSettled(true), [])
  return { ambientOcclusionSettled, handleAmbientOcclusionSettled }
}

// Combines the two asynchronous readiness signals into the single gate the captured frame and
// SCENE_READY_ATTRIBUTE share. When the ambient-occlusion pass is active the frame
// waits for both the lazy sky and the pipeline build; when it is inactive the gate is lighting
// readiness alone, so schematic states keep their existing single-signal
// contract unchanged. The wrapper reads ready only from drawnReadyFrame, which the draw
// sets from inside the animation loop once a frame requested with that gate open has drawn.
function useHarnessReadiness(ambientOcclusionActive: boolean): HarnessReadiness {
  const { lightingReady, handleLightingReady } = useHarnessLightingReadiness()
  const { ambientOcclusionSettled, handleAmbientOcclusionSettled } =
    useHarnessAmbientOcclusionReadiness()
  const [drawnReadyFrame, setDrawnReadyFrame] = useState<HarnessReadyFrame | null>(null)
  const handleReadyFrameDrawn = useCallback(
    (frame: HarnessReadyFrame) => setDrawnReadyFrame(frame),
    [],
  )
  const harnessReady = lightingReady && (!ambientOcclusionActive || ambientOcclusionSettled)
  return {
    harnessReady,
    drawnReadyFrame,
    handleLightingReady,
    handleAmbientOcclusionSettled,
    handleReadyFrameDrawn,
  }
}

// Whether this state's static frame draws through the ambient-occlusion pass, defaulting the
// absent realistic flag to schematic. Mirrors the live view's gate (ambientOcclusionActiveFor).
function harnessAmbientOcclusionActive(environment: HarnessEnvironment | undefined): boolean {
  return ambientOcclusionActiveFor(environment?.realistic ?? false)
}

// Builds and frames the selected fixture, memoized on the scene key and paint so the static
// frame reuses one derived scene graph across re-renders. Pulled out of HarnessStage so
// the component stays within the length limit.
function useFramedHarnessScene(scene: HarnessScene, paint: Record<string, SurfaceTreatment>) {
  return useMemo(() => {
    const fixture = HARNESS_FIXTURES[scene]
    return { ...buildFramedScene(fixture, paint), front: frontDirection(fixture) }
  }, [scene, paint])
}

// The stage owns the readiness flags, so the view gives it a key made from the whole harness
// state: another state mounts a new stage and the flags start again.
export function SceneHarnessView(props: SceneHarnessViewProps = {}) {
  return <HarnessStage key={harnessStateKey(props)} {...props} />
}

function HarnessStage({
  colorTemperatureK = DEFAULT_COLOR_TEMPERATURE_K,
  paint = NO_PAINT,
  scene = 'shell',
  environment,
}: SceneHarnessViewProps) {
  const { root, pose, bounds, front } = useFramedHarnessScene(scene, paint)
  const cameraOverride = resolveHarnessCameraPose(scene, environment)
  const ambientOcclusionActive = harnessAmbientOcclusionActive(environment)
  const readiness = useHarnessReadiness(ambientOcclusionActive)

  // React Three Fiber overwrites gl.shadowMap.enabled with !!shadows, so the Canvas
  // `shadows` prop keeps create-renderer's shadowMap setup (and its PCFSoftShadowMap type) alive.
  // forceWebGL pins the WebGL 2 backend so the committed baseline is a hardware-WebGL render
  // that never collides with a future WebGPU baseline.
  return (
    <div
      data-testid="scene-harness"
      {...harnessReadyProps(readiness.drawnReadyFrame)}
      style={{ width: HARNESS_WIDTH, height: HARNESS_HEIGHT }}
    >
      <SceneRendererCanvas
        frameloop="never"
        camera={harnessCameraProps(cameraOverride ?? pose)}
        forceWebGL
        shadows
      >
        <color attach="background" args={[HARNESS_BACKGROUND]} />
        <primitive object={root} />
        <HarnessLighting
          colorTemperatureK={colorTemperatureK}
          bounds={bounds}
          front={front}
          environment={environment}
          onReady={readiness.handleLightingReady}
        />
        <StaticFrame
          framing={{ bounds, cameraOverride, ambientOcclusionActive }}
          readiness={readiness}
        />
      </SceneRendererCanvas>
    </div>
  )
}
