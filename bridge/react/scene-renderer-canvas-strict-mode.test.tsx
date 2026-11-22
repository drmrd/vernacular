import { useEffect, type ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import type { CanvasProps } from '@react-three/fiber'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PLAIN_CANNOT_RENDER } from './scene-failure-probe-test-support'
import { SceneRendererCanvas } from './scene-renderer-canvas'
import {
  buildFakeRenderer,
  defer,
  recordUnhandledRejections,
  settle,
  type Deferred,
  type FakeRenderer,
} from './scene-renderer-canvas-test-support'

// The engine's loader and release function and the 3D library's Canvas are the collaborators of
// the wrapper. The release stub records which renderer it was asked to release, so each case
// counts identities and never inspects how or when the wrapper made the call.
const collaborators = vi.hoisted(() => ({
  loadFactory: (() => Promise.resolve(() => ({}))) as () => Promise<unknown>,
  canvasProps: [] as Array<Record<string, unknown>>,
  released: [] as unknown[],
}))

vi.mock('../../engine', () => ({
  loadSceneRendererFactory: () => collaborators.loadFactory(),
  releaseSceneRenderer: (renderer: unknown) => {
    collaborators.released.push(renderer)
    return Promise.resolve()
  },
}))

// The stand-in Canvas builds its renderer through the supplied gl function in an effect, as the
// library does. StrictMode runs every effect twice on mount, so the stand-in asks for a second
// renderer, which the real library may also do.
vi.mock('@react-three/fiber', () => ({
  // A component export legitimately keeps its PascalCase name in the mock.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  Canvas: ({ gl, children, ...props }: CanvasProps) => {
    collaborators.canvasProps.push({ gl, children, ...props })
    useEffect(() => {
      if (typeof gl === 'function') gl({ canvas: document.createElement('canvas') } as never)
    }, [gl])
    return <div data-testid="canvas">{children}</div>
  },
}))

const COULD_NOT_LOAD_MESSAGE =
  'Could not load the 3D view. Check your network connection, then reload the page.'
const CHILD = <div data-testid="child" />

interface Session {
  built: FakeRenderer[]
  started: Array<Deferred<void>>
  factory: ReturnType<typeof vi.fn>
  loaded: Deferred<unknown>
}

// Each call of the factory builds a new renderer whose init() settles when the test says so.
function arrangeSession(): Session {
  const built: FakeRenderer[] = []
  const started: Array<Deferred<void>> = []
  const factory = vi.fn(() => {
    const initialized = defer<void>()
    const renderer = buildFakeRenderer(initialized)
    started.push(initialized)
    built.push(renderer)
    return renderer
  })
  const loaded = defer<unknown>()
  collaborators.loadFactory = () => loaded.promise
  return { built, started, factory, loaded }
}

function renderStrict(props: Parameters<typeof SceneRendererCanvas>[0] = {}) {
  const ui: ReactNode = <SceneRendererCanvas {...props}>{CHILD}</SceneRendererCanvas>
  return render(ui, { reactStrictMode: true })
}

// Renders under StrictMode and loads the factory, so the stand-in Canvas has asked for two renderers.
async function startUpWithTwoRenderers(session: Session, props = {}) {
  const view = renderStrict(props)
  await settle(() => session.loaded.resolve(session.factory))
  const [first, second] = session.started
  const [firstRenderer, secondRenderer] = session.built
  if (!first || !second || !firstRenderer || !secondRenderer) {
    throw new Error('the stand-in Canvas built fewer than two renderers under StrictMode')
  }
  return { view, first, second, firstRenderer, secondRenderer }
}

function latestCanvasProps(): Record<string, unknown> {
  return collaborators.canvasProps[collaborators.canvasProps.length - 1] ?? {}
}

describe('SceneRendererCanvas under StrictMode with a stale renderer', () => {
  let session: Session

  beforeEach(() => {
    collaborators.canvasProps = []
    collaborators.released = []
    session = arrangeSession()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('stays not ready when only the first of two renderers finishes init(), and passes the caller props through once the second does', async () => {
    const { first, second } = await startUpWithTwoRenderers(session, { frameloop: 'demand' })

    await settle(() => first.resolve())

    expect(latestCanvasProps().frameloop).toBe('never')
    expect(screen.queryByTestId('child')).toBeNull()

    await settle(() => second.resolve())

    expect(latestCanvasProps().frameloop).toBe('demand')
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('shows no cannot-render status when the first of two renderers rejects, and mounts the children once the second finishes', async () => {
    const { first, second } = await startUpWithTwoRenderers(session)

    await settle(() => first.reject(new Error('no usable GPU backend')))

    expect(screen.queryByRole('status')).toBeNull()

    await settle(() => second.resolve())

    expect(screen.getByTestId('child')).toBeInTheDocument()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('releases the first of two renderers once while mounted and the second once on unmount', async () => {
    const { view, second, firstRenderer, secondRenderer } = await startUpWithTwoRenderers(session)

    expect(collaborators.released).toEqual([firstRenderer])

    await settle(() => second.resolve())

    expect(collaborators.released).toEqual([firstRenderer])

    view.unmount()

    expect(collaborators.released).toEqual([firstRenderer, secondRenderer])
  })
})

describe('SceneRendererCanvas under StrictMode with the other outcomes', () => {
  let session: Session

  beforeEach(() => {
    collaborators.canvasProps = []
    collaborators.released = []
    session = arrangeSession()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the placeholder and mounts no Canvas before the factory loads', () => {
    const { container } = renderStrict()

    expect(container.querySelector('canvas')).not.toBeNull()
    expect(screen.queryByTestId('canvas')).toBeNull()
  })

  it('shows the cannot-render status when the current renderer rejects init()', async () => {
    const { second } = await startUpWithTwoRenderers(session)

    await settle(() => second.reject(new Error('no usable GPU backend')))

    expect(screen.getByRole('status')).toHaveTextContent(PLAIN_CANNOT_RENDER)
    expect(screen.queryByTestId('child')).toBeNull()
  })

  it('shows the could-not-load alert with a Reload page button when the load fails', async () => {
    renderStrict()

    await settle(() => session.loaded.reject(new Error('the renderer chunk failed to load')))

    expect(screen.getByRole('alert')).toHaveTextContent(COULD_NOT_LOAD_MESSAGE)
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument()
  })

  it('hands the forceWebGL option to the renderer factory', async () => {
    await startUpWithTwoRenderers(session, { forceWebGL: true })

    expect(session.factory).toHaveBeenCalledWith(expect.objectContaining({ forceWebGL: true }))
  })
})

describe('SceneRendererCanvas under StrictMode when the newer renderer fails to build', () => {
  let session: Session
  let rejections: ReturnType<typeof recordUnhandledRejections>

  beforeEach(() => {
    collaborators.canvasProps = []
    collaborators.released = []
    session = arrangeSession()
    rejections = recordUnhandledRejections()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    rejections.stop()
    vi.restoreAllMocks()
  })

  // The first gl call builds a renderer whose init() stays pending; every later call's factory throws.
  async function startUpWithFailingSecondBuild() {
    const first = defer<void>()
    const firstRenderer = buildFakeRenderer(first)
    const factory = vi
      .fn()
      .mockReturnValueOnce(firstRenderer)
      .mockImplementation(() => {
        throw new Error('no WebGPU adapter')
      })
    renderStrict()
    await settle(() => session.loaded.resolve(factory))
    return { first, firstRenderer, factory }
  }

  it('keeps the cannot-render status and releases the first renderer once when its init() resolves after the failed build', async () => {
    const { first, firstRenderer, factory } = await startUpWithFailingSecondBuild()

    await settle(() => first.resolve())

    expect(screen.getByRole('status')).toHaveTextContent(PLAIN_CANNOT_RENDER)
    expect(screen.queryByTestId('child')).toBeNull()
    // A third call would mean that the wrapper mounted the canvas again after the failure.
    expect.soft(factory).toHaveBeenCalledTimes(2)
    expect(collaborators.released).toEqual([firstRenderer])
    expect(await rejections.read()).toEqual([])
  })

  it('keeps the cannot-render status and releases the first renderer once when its init() rejects after the failed build', async () => {
    const { first, firstRenderer, factory } = await startUpWithFailingSecondBuild()

    await settle(() => first.reject(new Error('no usable GPU backend')))

    expect(screen.getByRole('status')).toHaveTextContent(PLAIN_CANNOT_RENDER)
    expect(screen.queryByTestId('child')).toBeNull()
    // A third call would mean that the wrapper mounted the canvas again after the failure.
    expect.soft(factory).toHaveBeenCalledTimes(2)
    expect(collaborators.released).toEqual([firstRenderer])
    expect(await rejections.read()).toEqual([])
  })
})
