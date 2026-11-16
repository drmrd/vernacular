import { Canvas, type CanvasProps, type GLProps } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'

import {
  constructSceneRenderer,
  loadSceneRendererModule,
  type SceneRendererModule,
  type SceneRendererOptions,
} from '../../engine'

// The pane shown while the renderer module loads: the same blank, block-level canvas that
// React Three Fiber's Canvas shows before it draws its first frame.
const LOADING_CANVAS_STYLE = { display: 'block', width: '100%', height: '100%' } as const

function useSceneRendererModule(): SceneRendererModule | null {
  const [rendererModule, setRendererModule] = useState<SceneRendererModule | null>(null)
  useEffect(() => {
    let cancelled = false
    void loadSceneRendererModule().then((loaded) => {
      if (!cancelled) setRendererModule(loaded)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return rendererModule
}

// React Three Fiber's Canvas re-runs its setup on every render, and each run reads the
// canvas state once and then awaits the renderer factory. An asynchronous factory leaves a
// window in which a second render starts a second setup that builds a second renderer and a
// second default camera, neither of which is ever sized. So the module loads before the
// Canvas mounts, the factory constructs the renderer synchronously, and the backend's
// asynchronous init() starts here, outside React Three Fiber's setup.
function useSceneRendererStart(forceWebGL: boolean) {
  const rendererModule = useSceneRendererModule()
  const [initialized, setInitialized] = useState(false)
  const createRenderer = useMemo<GLProps | null>(() => {
    if (rendererModule === null) return null
    return (defaultProps) => {
      // React Three Fiber's web Canvas always supplies an HTMLCanvasElement here (the
      // OffscreenCanvas branch of DefaultGLProps applies only to its worker path).
      const canvas = defaultProps.canvas as HTMLCanvasElement
      const renderer = constructSceneRenderer(rendererModule, { canvas, forceWebGL })
      void renderer.init().then(() => setInitialized(true))
      return renderer
    }
  }, [rendererModule, forceWebGL])
  return { createRenderer, initialized }
}

/** The Canvas props a scene canvas takes: everything but the renderer, which it builds. */
export type SceneRendererCanvasProps = Omit<CanvasProps, 'gl'> &
  Pick<SceneRendererOptions, 'forceWebGL'>

/**
 * A React Three Fiber Canvas on the engine's scene renderer. It shows a blank canvas until the
 * renderer module loads, then mounts the Canvas with a synchronous renderer factory. Until the
 * renderer's backend has initialized, the frame loop stays off and the children stay unmounted,
 * because Three.js throws on a render, or on most renderer queries, before init() resolves.
 */
export function SceneRendererCanvas({
  forceWebGL = false,
  frameloop = 'always',
  children,
  ...canvasProps
}: SceneRendererCanvasProps) {
  const { createRenderer, initialized } = useSceneRendererStart(forceWebGL)
  if (createRenderer === null) return <canvas style={LOADING_CANVAS_STYLE} />
  return (
    <Canvas {...canvasProps} frameloop={initialized ? frameloop : 'never'} gl={createRenderer}>
      {initialized ? children : null}
    </Canvas>
  )
}
