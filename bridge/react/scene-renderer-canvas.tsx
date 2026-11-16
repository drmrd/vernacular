import { Canvas, type CanvasProps, type GLProps } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'

import {
  loadSceneRendererFactory,
  type SceneRendererFactory,
  type SceneRendererOptions,
} from '../../engine'

// The pane shown while the renderer factory loads: the same blank, block-level canvas that
// React Three Fiber's Canvas shows before it draws its first frame.
const LOADING_CANVAS_STYLE = { display: 'block', width: '100%', height: '100%' } as const

function useSceneRendererFactory(): SceneRendererFactory | null {
  const [rendererFactory, setRendererFactory] = useState<SceneRendererFactory | null>(null)
  useEffect(() => {
    let cancelled = false
    void loadSceneRendererFactory().then((loaded) => {
      if (!cancelled) setRendererFactory(() => loaded)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return rendererFactory
}

// React Three Fiber's Canvas re-runs its setup on every render, and each run reads the
// canvas state once and then awaits the renderer factory. An asynchronous factory leaves a
// window in which a second render starts a second setup that builds a second renderer and a
// second default camera, neither of which is ever sized. So the factory loads before the
// Canvas mounts and constructs the renderer synchronously, and the backend's asynchronous
// init() starts here, outside React Three Fiber's setup. The library still awaits the
// factory's result for one microtask, so only a render of the Canvas inside that same task
// could land in the window; no such path exists today.
function useSceneRendererStart(forceWebGL: boolean) {
  const rendererFactory = useSceneRendererFactory()
  const [initialized, setInitialized] = useState(false)
  const createRenderer = useMemo<GLProps | null>(() => {
    if (rendererFactory === null) return null
    return (defaultProps) => {
      // React Three Fiber's web Canvas always supplies an HTMLCanvasElement here (the
      // OffscreenCanvas branch of DefaultGLProps applies only to its worker path).
      const canvas = defaultProps.canvas as HTMLCanvasElement
      const renderer = rendererFactory({ canvas, forceWebGL })
      void renderer.init().then(() => setInitialized(true))
      return renderer
    }
  }, [rendererFactory, forceWebGL])
  return { createRenderer, initialized }
}

/** The Canvas props a scene canvas takes: everything but the renderer, which it builds. */
export type SceneRendererCanvasProps = Omit<CanvasProps, 'gl'> &
  Pick<SceneRendererOptions, 'forceWebGL'>

/**
 * A React Three Fiber Canvas on the engine's scene renderer. It shows a blank canvas until the
 * renderer factory loads, then mounts the Canvas with a synchronous renderer factory. Until the
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
