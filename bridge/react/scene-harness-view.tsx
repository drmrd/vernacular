import { Canvas, useThree, type GLProps } from '@react-three/fiber'
import { useCallback, useLayoutEffect, useMemo, useState } from 'react'
import {
  DEFAULT_COLOR_TEMPERATURE_K,
  type Bounds3,
  type CameraPose,
  type ObservationInstant,
  type Site,
  type SurfaceTreatment,
} from '../../core'
import { createSceneRenderer } from '../../engine'
import { ADJACENT_ROOMS_CAMERA_POSE } from './adjacent-rooms-fixture'
import { applyCameraPose, fitCameraToBounds } from './fit-camera'
import { buildFramedScene } from './framed-scene'
import { HARNESS_FIXTURES, type HarnessScene } from './harness-fixtures'
import { SceneLighting } from './scene-lighting'
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

// Fits the camera to the bounds for the pinned canvas size, then renders one frame on
// mount and one more when the lighting reports ready, so the screenshot is deterministic
// and never races an animation tick (the Canvas runs in `frameloop="never"`). The mount
// frame keeps the canvas from sitting blank while asynchronous lighting (the solar
// provider's lazily loaded sky) attaches; the ready frame is the one the baselines
// capture, awaited through the wrapper's data-harness-ready attribute. Fitting here
// (rather than only at scene build) frames the model to the harness aspect ratio and
// field of view, matching the live preview (ADR-0075).
/**
 * How to place the harness camera before rendering: fit the scene `bounds` to the
 * pinned canvas, unless a state supplies its own `cameraOverride` pose (the
 * adjacent-rooms below-datum vantage), in which case snap to that pose instead.
 */
interface HarnessFraming {
  bounds: Bounds3 | null
  cameraOverride: CameraPose | undefined
  // Whether this state's static frame draws through the ambient-occlusion pass; false leaves
  // it on the plain gl.render draw, so schematic and no-location states render as before.
  ambientOcclusionActive: boolean
}

function StaticFrame({
  framing,
  harnessReady,
  onAmbientOcclusionSettled,
}: {
  framing: HarnessFraming
  harnessReady: boolean
  onAmbientOcclusionSettled: () => void
}) {
  const { bounds, cameraOverride, ambientOcclusionActive } = framing
  const { gl, scene, camera, size } = useThree()
  // The same render seam the live view uses: when the ambient-occlusion pass is active the
  // frame draws through it, otherwise straight through gl.render, so a schematic or
  // no-location harness state renders exactly as before. onAmbientOcclusionSettled bubbles the
  // build's settlement up so the wrapper's ready gate waits for the installed pipeline.
  const renderFrame = useAmbientOcclusion(ambientOcclusionActive, onAmbientOcclusionSettled)
  // Draws the mount frame, then redraws once harnessReady flips: the lazy sky has attached and,
  // when active, the ambient-occlusion pipeline has settled, so the captured frame carries both.
  useLayoutEffect(() => {
    if (cameraOverride === undefined) fitCameraToBounds(camera, bounds, size)
    else applyCameraPose(camera, cameraOverride)
    renderFrame(gl, scene, camera)
  }, [renderFrame, gl, scene, camera, bounds, cameraOverride, size, harnessReady])
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
// off, no site). The readiness callback bubbles up so the harness can render its
// captured frame only after asynchronous lighting (the lazy sky) has attached.
function HarnessLighting({
  colorTemperatureK,
  bounds,
  environment,
  onReady,
}: {
  colorTemperatureK: number
  bounds: Bounds3 | null
  environment?: HarnessEnvironment | undefined
  onReady: () => void
}) {
  return (
    <SceneLighting
      colorTemperatureK={colorTemperatureK}
      bounds={bounds}
      realistic={environment?.realistic}
      site={environment?.site}
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
// The wrapper advertises it as data-harness-ready, which the visual specs await
// before screenshotting: React commits the attribute in the same pass whose layout
// effect renders the ready frame, so an observable "true" implies the frame exists.
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
// the data-harness-ready attribute share. When the ambient-occlusion pass is active the frame
// waits for both the lazy sky and the pipeline build; when it is inactive the gate is lighting
// readiness alone, so schematic and no-location states keep their existing single-signal
// contract unchanged.
function useHarnessReadiness(ambientOcclusionActive: boolean) {
  const { lightingReady, handleLightingReady } = useHarnessLightingReadiness()
  const { ambientOcclusionSettled, handleAmbientOcclusionSettled } =
    useHarnessAmbientOcclusionReadiness()
  const harnessReady = lightingReady && (!ambientOcclusionActive || ambientOcclusionSettled)
  return { harnessReady, handleLightingReady, handleAmbientOcclusionSettled }
}

// Whether this state's static frame draws through the ambient-occlusion pass, defaulting the
// absent realistic flag to schematic. Mirrors the live view's gate (ambientOcclusionActiveFor).
function harnessAmbientOcclusionActive(environment: HarnessEnvironment | undefined): boolean {
  return ambientOcclusionActiveFor(environment?.realistic ?? false, environment?.site)
}

// Constructs the harness renderer, forcing the WebGL 2 backend so the committed baseline is a
// hardware-WebGL render that never collides with a future WebGPU baseline. Pulled out of the
// Canvas element as a stable module value so SceneHarnessView stays within the length limit.
const createHarnessRenderer: GLProps = (defaultProps) =>
  createSceneRenderer({
    canvas: defaultProps.canvas as HTMLCanvasElement,
    forceWebGL: true,
  })

// Builds and frames the selected fixture, memoized on the scene key and paint so the static
// frame reuses one derived scene graph across re-renders. Pulled out of SceneHarnessView so
// the component stays within the length limit.
function useFramedHarnessScene(scene: HarnessScene, paint: Record<string, SurfaceTreatment>) {
  return useMemo(() => buildFramedScene(HARNESS_FIXTURES[scene], paint), [scene, paint])
}

export function SceneHarnessView({
  colorTemperatureK = DEFAULT_COLOR_TEMPERATURE_K,
  paint = {},
  scene = 'shell',
  environment,
}: SceneHarnessViewProps = {}) {
  const { root, pose, bounds } = useFramedHarnessScene(scene, paint)
  const cameraOverride = resolveHarnessCameraPose(scene, environment)
  const ambientOcclusionActive = harnessAmbientOcclusionActive(environment)
  const { harnessReady, handleLightingReady, handleAmbientOcclusionSettled } =
    useHarnessReadiness(ambientOcclusionActive)

  // React Three Fiber overwrites gl.shadowMap.enabled with !!shadows, so the Canvas
  // `shadows` prop keeps create-renderer's shadowMap setup (and its PCFSoftShadowMap type) alive.
  return (
    <div
      data-testid="scene-harness"
      data-harness-ready={harnessReady ? 'true' : 'false'}
      style={{ width: HARNESS_WIDTH, height: HARNESS_HEIGHT }}
    >
      <Canvas
        frameloop="never"
        camera={harnessCameraProps(cameraOverride ?? pose)}
        gl={createHarnessRenderer}
        shadows
      >
        <color attach="background" args={[HARNESS_BACKGROUND]} />
        <primitive object={root} />
        <HarnessLighting
          colorTemperatureK={colorTemperatureK}
          bounds={bounds}
          environment={environment}
          onReady={handleLightingReady}
        />
        <StaticFrame
          framing={{ bounds, cameraOverride, ambientOcclusionActive }}
          harnessReady={harnessReady}
          onAmbientOcclusionSettled={handleAmbientOcclusionSettled}
        />
      </Canvas>
    </div>
  )
}
