import { useEffect, type ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import type { CanvasProps, GLProps } from '@react-three/fiber'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SceneRendererCanvas } from './scene-renderer-canvas'
import { SCENE_RENDERER_FAILED_ATTRIBUTE } from './scene-readiness'
import {
  defer,
  recordUnhandledRejections,
  settle,
  type Deferred,
} from './scene-renderer-canvas-test-support'

// The engine's loader and the 3D library's Canvas are the two collaborators of the wrapper.
// Each case decides when the factory loads and when the renderer's init() settles, so the
// start-up order is held by the test and not by timing.
const collaborators = vi.hoisted(() => ({
  loadFactory: (() => Promise.resolve(() => ({}))) as () => Promise<unknown>,
  canvasProps: [] as Array<Record<string, unknown>>,
  glResults: [] as unknown[],
  released: [] as unknown[],
}))

vi.mock('../../engine', () => ({
  loadSceneRendererFactory: () => collaborators.loadFactory(),
  releaseSceneRenderer: (renderer: unknown) => {
    collaborators.released.push(renderer)
    return Promise.resolve()
  },
}))

// The stand-in Canvas records every render's props, renders its children as the real one does
// once its scene is ready, and builds its renderer through the supplied gl function, again only
// when that function changes, as the library does for a changed renderer factory. It keeps what
// each gl call returned.
vi.mock('@react-three/fiber', () => ({
  // A component export legitimately keeps its PascalCase name in the mock.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  Canvas: ({ gl, children, ...props }: CanvasProps) => {
    collaborators.canvasProps.push({ gl, children, ...props })
    useEffect(() => {
      if (typeof gl === 'function') {
        collaborators.glResults.push(gl({ canvas: document.createElement('canvas') } as never))
      }
    }, [gl])
    return <div data-testid="canvas">{children}</div>
  },
}))

interface FakeRenderer {
  init: ReturnType<typeof vi.fn>
}

interface Harness {
  renderer: FakeRenderer
  factory: ReturnType<typeof vi.fn>
  loaded: Deferred<unknown>
  initialized: Deferred<void>
}

function arrangeStartUp(): Harness {
  const initialized = defer<void>()
  const renderer: FakeRenderer = { init: vi.fn(() => initialized.promise) }
  const factory = vi.fn(() => renderer)
  const loaded = defer<unknown>()
  collaborators.loadFactory = () => loaded.promise
  return { renderer, factory, loaded, initialized }
}

function glOfRender(index: number): GLProps {
  return collaborators.canvasProps[index]?.gl as GLProps
}

function latestCanvasProps(): Record<string, unknown> {
  return collaborators.canvasProps[collaborators.canvasProps.length - 1] ?? {}
}

const CHILD = <div data-testid="child" />

// The failure kind that the wrapper's stand-in element declares, or null when none is shown.
function failureKindIn(container: HTMLElement): string | null {
  const marked = container.querySelector(`[${SCENE_RENDERER_FAILED_ATTRIBUTE}]`)
  return marked?.getAttribute(SCENE_RENDERER_FAILED_ATTRIBUTE) ?? null
}

function renderWrapper(props: Parameters<typeof SceneRendererCanvas>[0] = {}) {
  const ui = (): ReactNode => <SceneRendererCanvas {...props}>{CHILD}</SceneRendererCanvas>
  const view = render(ui())
  return { ...view, again: () => view.rerender(ui()) }
}

describe('SceneRendererCanvas', () => {
  let start: Harness

  beforeEach(() => {
    collaborators.canvasProps = []
    start = arrangeStartUp()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows a placeholder and mounts no Canvas until the renderer factory has loaded', () => {
    const { container } = renderWrapper()

    expect(container.querySelector('canvas')).not.toBeNull()
    expect(failureKindIn(container)).toBeNull()
    expect(screen.queryByTestId('canvas')).toBeNull()
    expect(collaborators.canvasProps).toHaveLength(0)
  })

  it('keeps the same gl function across renders of the wrapper with equal props', async () => {
    const { again } = renderWrapper({ shadows: true })
    await settle(() => start.loaded.resolve(start.factory))

    again()
    again()

    const identities = new Set(collaborators.canvasProps.map((_, index) => glOfRender(index)))
    expect(collaborators.canvasProps.length).toBeGreaterThan(1)
    expect(identities.size).toBe(1)
  })

  it('keeps the frame loop off and the children unmounted until init() resolves', async () => {
    renderWrapper({ frameloop: 'demand' })
    await settle(() => start.loaded.resolve(start.factory))

    expect(screen.getByTestId('canvas')).toBeInTheDocument()
    expect(latestCanvasProps().frameloop).toBe('never')
    expect(screen.queryByTestId('child')).toBeNull()
  })

  it('passes the caller frame loop and the children through once init() resolves', async () => {
    const { container } = renderWrapper({ frameloop: 'demand' })
    await settle(() => start.loaded.resolve(start.factory))
    await settle(() => start.initialized.resolve())

    expect(latestCanvasProps().frameloop).toBe('demand')
    expect(screen.getByTestId('child')).toBeInTheDocument()
    expect(failureKindIn(container)).toBeNull()
  })

  it('starts init() exactly once for one mounted wrapper, also after re-renders', async () => {
    const { again } = renderWrapper()
    await settle(() => start.loaded.resolve(start.factory))
    again()
    await settle(() => start.initialized.resolve())
    again()

    expect(start.factory).toHaveBeenCalledTimes(1)
    expect(start.renderer.init).toHaveBeenCalledTimes(1)
  })

  it('hands the forceWebGL option to the renderer factory', async () => {
    renderWrapper({ forceWebGL: true })
    await settle(() => start.loaded.resolve(start.factory))

    expect(start.factory).toHaveBeenCalledWith(expect.objectContaining({ forceWebGL: true }))
  })

  it('passes other Canvas props such as shadows through', async () => {
    renderWrapper({ shadows: true })
    await settle(() => start.loaded.resolve(start.factory))

    expect(latestCanvasProps().shadows).toBe(true)
  })

  it('unmounts while init() is pending without throwing or warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { unmount } = renderWrapper()
    await settle(() => start.loaded.resolve(start.factory))

    unmount()
    await settle(() => start.initialized.resolve())

    expect(warn).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })
})

// The wording and role that SceneCanvas already uses when the browser has no 3D backend at all.
const CANNOT_RENDER_MESSAGE = 'This browser cannot render the 3D view.'
const COULD_NOT_LOAD_MESSAGE =
  'Could not load the 3D view. Check your network connection, then retry.'

describe('SceneRendererCanvas when the renderer cannot start', () => {
  let start: Harness
  let rejections: ReturnType<typeof recordUnhandledRejections>

  beforeEach(() => {
    collaborators.canvasProps = []
    collaborators.glResults = []
    collaborators.released = []
    start = arrangeStartUp()
    rejections = recordUnhandledRejections()
  })

  afterEach(() => {
    rejections.stop()
  })

  it('shows the cannot-render status and mounts no children when init() rejects', async () => {
    const { container } = renderWrapper()
    await settle(() => start.loaded.resolve(start.factory))
    await settle(() => start.initialized.reject(new Error('no usable GPU backend')))

    expect(screen.getByRole('status')).toHaveTextContent(CANNOT_RENDER_MESSAGE)
    expect(screen.queryByTestId('child')).toBeNull()
    expect(failureKindIn(container)).toBe('start')
  })

  it('offers no retry when init() rejects', async () => {
    renderWrapper()
    await settle(() => start.loaded.resolve(start.factory))
    await settle(() => start.initialized.reject(new Error('no usable GPU backend')))

    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
  })

  it('leaves no unhandled rejection when init() rejects', async () => {
    renderWrapper()
    await settle(() => start.loaded.resolve(start.factory))
    await settle(() => start.initialized.reject(new Error('no usable GPU backend')))

    expect(await rejections.read()).toEqual([])
  })

  it('shows the cannot-render status and builds nothing to release when the renderer factory throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const factory = vi.fn(() => {
      throw new Error('no WebGPU adapter')
    })
    const { container } = renderWrapper()
    await settle(() => start.loaded.resolve(factory))

    expect(warn).toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent(CANNOT_RENDER_MESSAGE)
    expect(failureKindIn(container)).toBe('start')
    expect(screen.queryByTestId('child')).toBeNull()
    expect(screen.queryByTestId('canvas')).toBeNull()
    expect(collaborators.glResults).toHaveLength(1)
    expect(collaborators.glResults[0]).toEqual(
      expect.objectContaining({ then: expect.any(Function) }),
    )
    expect(collaborators.released).toEqual([])
    expect(await rejections.read()).toEqual([])
  })
})

const LOAD_FAILURE = new Error('the renderer chunk failed to load')

describe('SceneRendererCanvas when the renderer module does not load', () => {
  let start: Harness
  let rejections: ReturnType<typeof recordUnhandledRejections>

  beforeEach(() => {
    collaborators.canvasProps = []
    start = arrangeStartUp()
    rejections = recordUnhandledRejections()
  })

  afterEach(() => {
    rejections.stop()
  })

  it('shows the could-not-load alert with a Retry button and no cannot-render status', async () => {
    const { container } = renderWrapper()
    await settle(() => start.loaded.reject(LOAD_FAILURE))

    expect(screen.getByRole('alert')).toHaveTextContent(COULD_NOT_LOAD_MESSAGE)
    expect(failureKindIn(container)).toBe('load')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByTestId('canvas')).toBeNull()
  })

  it('leaves no unhandled rejection when the renderer factory fails to load', async () => {
    renderWrapper()
    await settle(() => start.loaded.reject(LOAD_FAILURE))

    expect(await rejections.read()).toEqual([])
  })

  it('returns to the placeholder while Retry loads, then mounts the Canvas once it loads', async () => {
    renderWrapper()
    await settle(() => start.loaded.reject(LOAD_FAILURE))
    const retry = arrangeStartUp()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(screen.queryByRole('alert')).toBeNull()
    expect(document.querySelector('canvas')).not.toBeNull()
    expect(screen.queryByTestId('canvas')).toBeNull()
    await settle(() => retry.loaded.resolve(retry.factory))
    expect(screen.getByTestId('canvas')).toBeInTheDocument()
  })

  it('shows the could-not-load alert again when the retried load also fails', async () => {
    renderWrapper()
    await settle(() => start.loaded.reject(LOAD_FAILURE))
    const retry = arrangeStartUp()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await settle(() => retry.loaded.reject(LOAD_FAILURE))

    expect(screen.getByRole('alert')).toHaveTextContent(COULD_NOT_LOAD_MESSAGE)
    expect(await rejections.read()).toEqual([])
  })
})
