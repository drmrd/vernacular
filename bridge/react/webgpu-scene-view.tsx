import { Canvas } from '@react-three/fiber'
import { useMemo } from 'react'
import { BasicLightingProvider, buildScene, createSceneRenderer } from '../../engine'
import { useEditorSession } from './editor-session-context'

/**
 * Mounts the React Three Fiber canvas with the WebGPU renderer. It is rendered only
 * when WebGPU is available, so it never executes under jsdom; the renderer itself is
 * constructed in the engine layer.
 */
export function WebGPUSceneView() {
  const session = useEditorSession()
  const root = useMemo(() => {
    const scene = buildScene(session.getSceneGraph())
    new BasicLightingProvider().apply(scene)
    return scene
  }, [session])

  return (
    <Canvas
      // React Three Fiber's web Canvas always supplies an HTMLCanvasElement here
      // (the OffscreenCanvas branch of DefaultGLProps applies only to its worker
      // path), so narrowing the cast away from OffscreenCanvas is safe.
      gl={(defaultProps) =>
        createSceneRenderer({ canvas: defaultProps.canvas as HTMLCanvasElement })
      }
    >
      <primitive object={root} />
    </Canvas>
  )
}
