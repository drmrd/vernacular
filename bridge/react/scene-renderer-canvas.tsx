import { Canvas, type CanvasProps, type GLProps } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  loadSceneRendererFactory,
  releaseSceneRenderer,
  type SceneRendererFactory,
  type SceneRendererOptions,
} from '../../engine'
import { SceneUnsupportedStatus } from './scene-unsupported-status'

// The pane shown while the renderer factory loads: the same blank, block-level canvas that
// React Three Fiber's Canvas shows before it draws its first frame.
const LOADING_CANVAS_STYLE = { display: 'block', width: '100%', height: '100%' } as const

type SceneRendererStatus = 'loading' | 'starting' | 'ready' | 'failed'

// The repository has no error-reporting channel for the bridge layer yet; a failed start is
// logged the way the other bridge loaders log theirs, so the cause stays reachable in the console.
function logStartFailure(stage: 'load' | 'start', error: unknown): void {
  console.warn(`Scene renderer failed to ${stage}`, error)
}

function useSceneRendererFactory(
  setStatus: (status: SceneRendererStatus) => void,
): SceneRendererFactory | null {
  const [rendererFactory, setRendererFactory] = useState<SceneRendererFactory | null>(null)
  useEffect(() => {
    let cancelled = false
    loadSceneRendererFactory().then(
      (loaded) => {
        if (cancelled) return
        setRendererFactory(() => loaded)
        setStatus('starting')
      },
      (error: unknown) => {
        logStartFailure('load', error)
        if (!cancelled) setStatus('failed')
      },
    )
    return () => {
      cancelled = true
    }
  }, [setStatus])
  return rendererFactory
}

type HeldRenderer = {
  renderer: ReturnType<SceneRendererFactory>
  started: Promise<unknown>
}

type RendererRelease = {
  hold: (renderer: HeldRenderer['renderer'], started: Promise<unknown>) => void
  release: () => void
}

// Keeps the renderer the wrapper built, and releases it once: on demand, or when the wrapper
// unmounts, also while its init() is still pending. Releasing clears the ref, so a renderer
// released after a failed start is not released again on unmount. The hook owns the ref, so
// callers only hand over a renderer and ask for its release.
function useRendererRelease(): RendererRelease {
  const held = useRef<HeldRenderer | null>(null)
  const hold = useCallback((renderer: HeldRenderer['renderer'], started: Promise<unknown>) => {
    held.current = { renderer, started }
  }, [])
  const release = useCallback(() => {
    const current = held.current
    if (current === null) return
    held.current = null
    void releaseSceneRenderer(current.renderer, current.started)
  }, [])
  useEffect(() => release, [release])
  return { hold, release }
}

// Tells whether the wrapper is still mounted, so a late init() result does not set state after
// unmount.
function useMountedRef() {
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  return mounted
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
  const [status, setStatus] = useState<SceneRendererStatus>('loading')
  const rendererFactory = useSceneRendererFactory(setStatus)
  const { hold, release } = useRendererRelease()
  const mounted = useMountedRef()
  const createRenderer = useMemo<GLProps | null>(() => {
    if (rendererFactory === null) return null
    return (defaultProps) => {
      // React Three Fiber's web Canvas always supplies an HTMLCanvasElement here (the
      // OffscreenCanvas branch of DefaultGLProps applies only to its worker path).
      const canvas = defaultProps.canvas as HTMLCanvasElement
      const renderer = rendererFactory({ canvas, forceWebGL })
      const started = renderer.init()
      hold(renderer, started)
      started.then(
        () => {
          if (mounted.current) setStatus('ready')
        },
        (error: unknown) => {
          logStartFailure('start', error)
          release()
          if (mounted.current) setStatus('failed')
        },
      )
      return renderer
    }
  }, [rendererFactory, forceWebGL, hold, mounted, release])
  return { createRenderer, status }
}

/** The Canvas props a scene canvas takes: everything but the renderer, which it builds. */
export type SceneRendererCanvasProps = Omit<CanvasProps, 'gl'> &
  Pick<SceneRendererOptions, 'forceWebGL'>

/**
 * A React Three Fiber Canvas on the engine's scene renderer. It shows a blank canvas until the
 * renderer factory loads, then mounts the Canvas with a synchronous renderer factory. Until the
 * renderer's backend has initialized, the frame loop stays off and the children stay unmounted,
 * because Three.js throws on a render, or on most renderer queries, before init() resolves. The
 * wrapper can end in a failed state, in which it shows the cannot-render status and mounts no
 * canvas, and it stays there until it mounts again. Every renderer the wrapper builds is released
 * exactly once through the engine's releaseSceneRenderer: when its init() rejects, and otherwise
 * when the wrapper unmounts, also while init() is still pending. Opening and closing the view any
 * number of times therefore leaves no renderer and no animation loop alive.
 */
export function SceneRendererCanvas({
  forceWebGL = false,
  frameloop = 'always',
  children,
  ...canvasProps
}: SceneRendererCanvasProps) {
  const { createRenderer, status } = useSceneRendererStart(forceWebGL)
  if (status === 'failed') return <SceneUnsupportedStatus />
  if (createRenderer === null) return <canvas style={LOADING_CANVAS_STYLE} />
  const initialized = status === 'ready'
  return (
    <Canvas {...canvasProps} frameloop={initialized ? frameloop : 'never'} gl={createRenderer}>
      {initialized ? children : null}
    </Canvas>
  )
}
