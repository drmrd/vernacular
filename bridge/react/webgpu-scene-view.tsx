import { Canvas, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo } from 'react'
import { sceneGraphForFloor, type CameraPose } from '../../core'
import { createSceneRenderer } from '../../engine'
import { useActiveFloorId } from './active-floor-context'
import { buildFramedScene } from './framed-scene'
import { useSceneGraph } from './use-scene-graph'

// Applies the framed camera pose to the live canvas camera and re-applies it
// whenever the pose changes (for example after a wall is drawn and the scene
// reframes). The live Canvas runs the default continuous frameloop, so no manual
// render is needed; only the camera state has to be kept in sync with the pose.
function FrameCamera({ pose }: { pose: CameraPose }) {
  const camera = useThree((state) => state.camera)
  useLayoutEffect(() => {
    camera.position.set(pose.position.x, pose.position.y, pose.position.z)
    camera.near = pose.near
    camera.far = pose.far
    camera.lookAt(pose.target.x, pose.target.y, pose.target.z)
    camera.updateProjectionMatrix()
  }, [camera, pose])
  return null
}

/**
 * Mounts the React Three Fiber canvas with the WebGPU renderer. It is rendered only
 * when WebGPU is available, so it never executes under jsdom; the renderer itself is
 * constructed in the engine layer. The pane subscribes to the live scene graph scoped
 * to the active floor, so it rebuilds and reframes as the plan is edited.
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
  const { root, pose } = useMemo(() => buildFramedScene(graph), [graph])

  return (
    <Canvas
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
      <FrameCamera pose={pose} />
    </Canvas>
  )
}
