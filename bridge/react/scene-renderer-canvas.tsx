import { Canvas, type CanvasProps, type GLProps } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  loadSceneRendererFactory,
  releaseSceneRenderer,
  type SceneRendererFactory,
  type SceneRendererOptions,
} from '../../engine'
import { SceneLoadFailedStatus } from './scene-load-failed-status'
import { SceneUnsupportedStatus } from './scene-unsupported-status'

// The pane shown while the renderer factory loads: the same blank, block-level canvas that
// React Three Fiber's Canvas shows before it draws its first frame.
const LOADING_CANVAS_STYLE = { display: 'block', width: '100%', height: '100%' } as const

type SceneRendererStatus = 'loading' | 'starting' | 'ready' | 'load-failed' | 'failed'

// The repository has no error-reporting channel for the bridge layer yet; a failed start is
// logged the way the other bridge loaders log theirs, so the cause stays reachable in the console.
function logStartFailure(stage: 'load' | 'build' | 'start', error: unknown): void {
  console.warn(`Scene renderer failed to ${stage}`, error)
}

// What the gl function returns when the factory throws. It stays pending on purpose: React Three
// Fiber builds its own WebGLRenderer for any gl result that is not a renderer, and a throw out of
// gl would escape the library's setup as an unhandled rejection. The wrapper swaps the Canvas for
// the cannot-render status, so nothing awaits this promise.
const NEVER_SETTLES = new Promise<never>(() => {})

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
        if (!cancelled) setStatus('load-failed')
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
  isCurrent: (renderer: HeldRenderer['renderer']) => boolean
  release: () => void
}

// Keeps the renderer the wrapper built last, which is the current renderer, and releases each
// renderer once: when a newer one supersedes it, on demand, or when the wrapper unmounts, also
// while its init() is still pending. Releasing clears the ref, so nothing is current after a
// release and a renderer released after a failed start is not released again on unmount. The
// hook owns the ref, so callers only hand over a renderer and ask for its release.
function useRendererRelease(): RendererRelease {
  const held = useRef<HeldRenderer | null>(null)
  const release = useCallback(() => {
    const current = held.current
    if (current === null) return
    held.current = null
    void releaseSceneRenderer(current.renderer, current.started)
  }, [])
  const hold = useCallback(
    (renderer: HeldRenderer['renderer'], started: Promise<unknown>) => {
      release()
      held.current = { renderer, started }
    },
    [release],
  )
  const isCurrent = useCallback(
    (renderer: HeldRenderer['renderer']) => held.current?.renderer === renderer,
    [],
  )
  useEffect(() => release, [release])
  return { hold, isCurrent, release }
}

type RendererBuild = RendererRelease & {
  canvas: HTMLCanvasElement
  rendererFactory: SceneRendererFactory
  forceWebGL: boolean
  setStatus: (status: SceneRendererStatus) => void
}

// Builds one renderer for the gl function and makes it the current one. Only the current
// renderer's init() may move the status on, so a renderer that a newer one replaced cannot
// overwrite the newer one's status. A factory that throws ends in the cannot-render status.
function buildCurrentRenderer(build: RendererBuild): HeldRenderer['renderer'] {
  const { canvas, rendererFactory, forceWebGL, setStatus, hold, isCurrent, release } = build
  let renderer: HeldRenderer['renderer']
  try {
    renderer = rendererFactory({ canvas, forceWebGL })
  } catch (error) {
    logStartFailure('build', error)
    // A renderer still held from an earlier call is no longer the one the canvas asked for last.
    // If it stayed held, its init() result would mark the wrapper ready again and mount the
    // canvas a second time, and nothing else would release it.
    release()
    setStatus('failed')
    // GLProps types a gl function as all-Renderer or all-Promise, and this one returns both.
    return NEVER_SETTLES as unknown as HeldRenderer['renderer']
  }
  const started = renderer.init()
  hold(renderer, started)
  started.then(
    () => {
      if (isCurrent(renderer)) setStatus('ready')
    },
    (error: unknown) => {
      logStartFailure('start', error)
      if (!isCurrent(renderer)) return
      release()
      setStatus('failed')
    },
  )
  return renderer
}

// React Three Fiber's Canvas re-runs its setup on every render, and each run reads the
// canvas state once and then awaits the renderer factory. An asynchronous factory leaves a
// window in which a second render starts a second setup that builds a second renderer and a
// second default camera, neither of which is ever sized. So the factory loads before the
// Canvas mounts and constructs the renderer synchronously, and the backend's asynchronous
// init() starts here, outside React Three Fiber's setup. The library may still ask for a
// renderer more than once, for example under StrictMode. The window is closed this way: the
// renderer asked for last is the current one, a newer renderer releases the older one at once,
// and only the current renderer's init() can set the status.
function useSceneRendererStart(forceWebGL: boolean) {
  const [status, setStatus] = useState<SceneRendererStatus>('loading')
  const rendererFactory = useSceneRendererFactory(setStatus)
  const { hold, isCurrent, release } = useRendererRelease()
  const createRenderer = useMemo<GLProps | null>(() => {
    if (rendererFactory === null) return null
    return (defaultProps) =>
      buildCurrentRenderer({
        // React Three Fiber's web Canvas always supplies an HTMLCanvasElement here (the
        // OffscreenCanvas branch of DefaultGLProps applies only to its worker path).
        canvas: defaultProps.canvas as HTMLCanvasElement,
        rendererFactory,
        forceWebGL,
        setStatus,
        hold,
        isCurrent,
        release,
      })
  }, [rendererFactory, forceWebGL, hold, isCurrent, release])
  return { createRenderer, status }
}

function reloadBrowserPage(): void {
  window.location.reload()
}

/** The Canvas props a scene canvas takes: everything but the renderer, which it builds. */
export type SceneRendererCanvasProps = Omit<CanvasProps, 'gl' | 'flat'> &
  Pick<SceneRendererOptions, 'forceWebGL'> & {
    /**
     * Called once when the user presses Reload page in the could-not-load alert. The default
     * reloads the browser page. The button reloads the page instead of loading the renderer
     * module again, because a retry in place cannot be relied on: Chromium 148 kept a failed
     * dynamic import for its address, sent no second request, and rejected the next import() at
     * once. A reloaded page fetches the module again in any case. The page's unload guard arms a
     * beforeunload listener while the project has unsaved changes, so the browser asks the user
     * to confirm before the reload discards them.
     */
    reloadPage?: () => void
  }

/**
 * A React Three Fiber Canvas on the engine's scene renderer. It shows a blank canvas until the
 * renderer factory loads, then mounts the Canvas with a synchronous renderer factory. Until the
 * renderer's backend has initialized, the frame loop stays off and the children stay unmounted,
 * because Three.js throws on a render, or on most renderer queries, before init() resolves. Every
 * renderer the wrapper builds is released exactly once through the engine's releaseSceneRenderer:
 * when its init() rejects, when a newer renderer replaces it, when a later build fails (the held
 * renderer is no longer the one the canvas asked for last), and otherwise when the wrapper
 * unmounts, also while init() is still pending. Opening and closing the view any number of times
 * therefore leaves no renderer and no animation loop alive. A renderer module that does not
 * load ends in a could-not-load state with a Reload page button; the wrapper makes no second
 * load attempt in place. Chromium 148 kept a failed dynamic import for its address and rejected
 * the next import() at once, and a reloaded page fetches the module again in any case. The page's
 * unload guard asks the user to confirm the reload while the project has unsaved changes. A
 * renderer that cannot be built or started ends in the cannot-render state. Each stays until the
 * page goes away or a new mount. The library asks for a second renderer only when two of its
 * setups start in one task; StrictMode alone does not, because the Canvas waits for a measured
 * size. If it does, the wrapper follows the last one and releases the other.
 */
export function SceneRendererCanvas({
  forceWebGL = false,
  frameloop = 'always',
  reloadPage = reloadBrowserPage,
  children,
  ...canvasProps
}: SceneRendererCanvasProps) {
  const { createRenderer, status } = useSceneRendererStart(forceWebGL)
  if (status === 'load-failed') return <SceneLoadFailedStatus onReload={reloadPage} />
  if (status === 'failed') return <SceneUnsupportedStatus />
  if (createRenderer === null) return <canvas style={LOADING_CANVAS_STYLE} />
  const initialized = status === 'ready'
  return (
    // The library still writes toneMapping once while it configures the canvas. flat makes that
    // write the identity operator. SceneLighting's layout effect sets the visible operator, and
    // it runs after, because the library renders the children only once configure has resolved.
    <Canvas {...canvasProps} flat frameloop={initialized ? frameloop : 'never'} gl={createRenderer}>
      {initialized ? children : null}
    </Canvas>
  )
}
