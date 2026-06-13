import { Canvas, useThree } from '@react-three/fiber'
import { useCallback, useLayoutEffect, useMemo, useState } from 'react'
import {
  sceneGraphForFloor,
  DEFAULT_COLOR_TEMPERATURE_K,
  type Bounds3,
  type CameraPose,
} from '../../core'
import { createSceneRenderer, type SceneRoot } from '../../engine'
import { useActiveFloorId } from './active-floor-context'
import { buildFramedScene } from './framed-scene'
import { OrbitCameraControls } from './orbit-camera-controls'
import { SceneLighting } from './scene-lighting'
import { SceneNavToolbar, type NavMode } from './scene-nav-toolbar'
import { useSceneGraph } from './use-scene-graph'
import { WalkCameraControls } from './walk-camera-controls'

// Applies the framed camera pose to the live canvas camera while the user has not
// taken control of the camera, and re-applies it whenever the pose changes (for
// example after a wall is drawn and the scene reframes). Once the user orbits or
// walks, `active` goes false and the pose stops being applied, so an edit no longer
// yanks a navigated camera; clearing user control (the reset button) makes `active`
// true again, which reframes. The live Canvas is set to frameloop="always" so
// interactive camera moves render continuously; only the camera state has to be
// kept in sync with the pose.
function FrameCamera({ pose, active }: { pose: CameraPose; active: boolean }) {
  const camera = useThree((state) => state.camera)
  useLayoutEffect(() => {
    if (!active) return
    camera.position.set(pose.position.x, pose.position.y, pose.position.z)
    camera.near = pose.near
    camera.far = pose.far
    camera.lookAt(pose.target.x, pose.target.y, pose.target.z)
    camera.updateProjectionMatrix()
  }, [camera, pose, active])
  return null
}

// The per-view camera navigation state: the active mode and whether the user has
// taken control of the camera. Session state held in the view layer, never in the
// model or undo. Reset clears user control, which lets FrameCamera reapply the
// framed pose through its `active` transition.
function useSceneNavigation() {
  const [mode, setMode] = useState<NavMode>('orbit')
  const [userControlled, setUserControlled] = useState(false)
  const markUserControlled = useCallback(() => setUserControlled(true), [])
  const resetView = useCallback(() => setUserControlled(false), [])
  return { mode, setMode, userControlled, markUserControlled, resetView }
}

// Per-view color-temperature session state, held in the view component (foundation
// section 5.3), never in the model or undo. It feeds the toolbar slider and, once
// wired, the scene lighting.
function useColorTemperature() {
  const [colorTemperatureK, setColorTemperatureK] = useState(DEFAULT_COLOR_TEMPERATURE_K)
  return { colorTemperatureK, setColorTemperatureK }
}

interface LiveSceneCanvasProps {
  root: SceneRoot
  pose: CameraPose
  bounds: Bounds3 | null
  mode: NavMode
  userControlled: boolean
  onUserControl: () => void
  colorTemperatureK: number
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
      <FrameCamera pose={pose} active={!userControlled} />
      <OrbitCameraControls
        enabled={mode === 'orbit'}
        target={pose.target}
        onUserControl={onUserControl}
      />
      <WalkCameraControls enabled={mode === 'walk'} onUserControl={onUserControl} />
    </Canvas>
  )
}

/**
 * Mounts the React Three Fiber canvas with the WebGPU renderer, with a navigation
 * toolbar above it. It is rendered only when WebGPU is available, so it never
 * executes under jsdom; the renderer itself is constructed in the engine layer. The
 * pane subscribes to the live scene graph scoped to the active floor, so it rebuilds
 * and reframes as the plan is edited.
 */
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
  const { root, pose, bounds } = useMemo(() => buildFramedScene(graph), [graph])
  const { mode, setMode, userControlled, markUserControlled, resetView } = useSceneNavigation()
  const { colorTemperatureK, setColorTemperatureK } = useColorTemperature()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <SceneNavToolbar
        mode={mode}
        onModeChange={setMode}
        onReset={resetView}
        colorTemperatureK={colorTemperatureK}
        onColorTemperatureChange={setColorTemperatureK}
      />
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <LiveSceneCanvas
          root={root}
          pose={pose}
          bounds={bounds}
          mode={mode}
          userControlled={userControlled}
          onUserControl={markUserControlled}
          colorTemperatureK={colorTemperatureK}
        />
      </div>
    </div>
  )
}
