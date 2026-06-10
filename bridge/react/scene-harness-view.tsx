import { Canvas, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo } from 'react'
import * as THREE from 'three'
import { DEFAULT_CAMERA_POSE } from '../../core'
import { BasicLightingProvider, createSceneRenderer } from '../../engine'

// Deterministic fixture canvas size, pinned so the committed baseline is pixel-stable
// across runs and machines. Kept small to keep the baseline PNG lightweight.
const HARNESS_WIDTH = 320
const HARNESS_HEIGHT = 240

// An opaque clear color so the rendered frame is a real, non-transparent render rather
// than a blank alpha=0 canvas (an empty scene has no geometry to fill the frame).
const HARNESS_BACKGROUND = 0x1b2a3a

// Renders exactly one frame on mount and never again, so the screenshot is deterministic
// and never races an animation tick (the Canvas runs in `frameloop="never"`).
function StaticFrame() {
  const { gl, scene, camera } = useThree()
  useLayoutEffect(() => {
    const { target } = DEFAULT_CAMERA_POSE
    camera.lookAt(target.x, target.y, target.z)
    gl.render(scene, camera)
  }, [gl, scene, camera])
  return null
}

/**
 * A deterministic, test-only three-dimensional render harness. It boots the same
 * empty-scene-plus-basic-lighting pipeline production uses, but pins the canvas size,
 * uses a fixed opaque background, forces the WebGL 2 backend, and renders a single
 * static frame. The Playwright visual baseline screenshots this canvas. It is mounted
 * only when the `?fixture=scene-harness` query parameter is present (see the App), so
 * a normal page load never reaches it.
 */
export function SceneHarnessView() {
  const lighting = useMemo(() => {
    const group = new THREE.Group()
    new BasicLightingProvider().apply(group)
    return group
  }, [])

  const { position } = DEFAULT_CAMERA_POSE

  return (
    <div data-testid="scene-harness" style={{ width: HARNESS_WIDTH, height: HARNESS_HEIGHT }}>
      <Canvas
        frameloop="never"
        camera={{
          position: [position.x, position.y, position.z],
          near: DEFAULT_CAMERA_POSE.near,
          far: DEFAULT_CAMERA_POSE.far,
        }}
        // Force the WebGL 2 backend so the committed baseline is a hardware-WebGL render
        // that never collides with a future WebGPU baseline.
        gl={(defaultProps) =>
          createSceneRenderer({
            canvas: defaultProps.canvas as HTMLCanvasElement,
            forceWebGL: true,
          })
        }
      >
        <color attach="background" args={[HARNESS_BACKGROUND]} />
        <primitive object={lighting} />
        <StaticFrame />
      </Canvas>
    </div>
  )
}
