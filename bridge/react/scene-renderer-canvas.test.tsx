import { useEffect, type ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import type { CanvasProps, GLProps } from '@react-three/fiber'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  FailureProbe,
  PLAIN_CANNOT_RENDER,
  PLAIN_COULD_NOT_LOAD,
} from './scene-failure-probe-test-support'
import { SceneFailureViewContext, type SceneFailureView } from './scene-failure-view-context'
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

function renderWrapper(
  props: Parameters<typeof SceneRendererCanvas>[0] = {},
  failureView?: SceneFailureView,
) {
  const ui = (): ReactNode => {
    const wrapper = <SceneRendererCanvas {...props}>{CHILD}</SceneRendererCanvas>
    return failureView ? (
      <SceneFailureViewContext.Provider value={failureView}>
        {wrapper}
      </SceneFailureViewContext.Provider>
    ) : (
      wrapper
    )
  }
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

    expect(screen.getByRole('status')).toHaveTextContent(PLAIN_CANNOT_RENDER)
    expect(screen.queryByTestId('child')).toBeNull()
    expect(failureKindIn(container)).toBe('start')
  })

  it('shows the view that fills the failure slot in place of the cannot-render status when init() rejects', async () => {
    const { container } = renderWrapper({}, FailureProbe)
    await settle(() => start.loaded.resolve(start.factory))
    await settle(() => start.initialized.reject(new Error('no usable GPU backend')))

    const filled = screen.getByRole('button', { name: 'filled view' })
    expect(filled).toHaveAttribute('data-kind', 'start')
    expect(screen.queryByRole('status')).toBeNull()
    expect(failureKindIn(container)).toBe('start')
  })

  it('marks exactly one element as the failure view when init() rejects', async () => {
    const { container } = renderWrapper()
    await settle(() => start.loaded.resolve(start.factory))
    await settle(() => start.initialized.reject(new Error('no usable GPU backend')))

    expect(container.querySelectorAll(`[${SCENE_RENDERER_FAILED_ATTRIBUTE}]`)).toHaveLength(1)
  })

  it('offers no Reload page button when init() rejects', async () => {
    renderWrapper()
    await settle(() => start.loaded.resolve(start.factory))
    await settle(() => start.initialized.reject(new Error('no usable GPU backend')))

    expect(screen.queryByRole('button', { name: 'Reload page' })).toBeNull()
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
    expect(screen.getByRole('status')).toHaveTextContent(PLAIN_CANNOT_RENDER)
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

  it('shows the could-not-load alert with a Reload page button and no cannot-render status', async () => {
    const { container } = renderWrapper()
    await settle(() => start.loaded.reject(LOAD_FAILURE))

    expect(screen.getByRole('alert')).toHaveTextContent(PLAIN_COULD_NOT_LOAD)
    expect(failureKindIn(container)).toBe('load')
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByTestId('canvas')).toBeNull()
  })

  it('hands reloadPage to the view that fills the failure slot', async () => {
    const reloadPage = vi.fn()
    renderWrapper({ reloadPage }, FailureProbe)
    await settle(() => start.loaded.reject(LOAD_FAILURE))

    const probe = screen.getByRole('button', { name: 'filled view' })
    expect(probe).toHaveAttribute('data-kind', 'load')
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(probe)
    expect(reloadPage).toHaveBeenCalledTimes(1)
  })

  it('marks exactly one element as the failure view when the renderer module does not load', async () => {
    const { container } = renderWrapper()
    await settle(() => start.loaded.reject(LOAD_FAILURE))

    expect(container.querySelectorAll(`[${SCENE_RENDERER_FAILED_ATTRIBUTE}]`)).toHaveLength(1)
  })

  it('leaves no unhandled rejection when the renderer factory fails to load', async () => {
    renderWrapper()
    await settle(() => start.loaded.reject(LOAD_FAILURE))

    expect(await rejections.read()).toEqual([])
  })

  it('lets a later mount succeed after a failed load', async () => {
    const failed = renderWrapper()
    await settle(() => start.loaded.reject(LOAD_FAILURE))
    failed.unmount()

    const later = arrangeStartUp()
    const { container } = renderWrapper()
    await settle(() => later.loaded.resolve(later.factory))

    expect(screen.getByTestId('canvas')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
    expect(failureKindIn(container)).toBeNull()
  })

  it('calls reloadPage exactly once when Reload page is pressed', async () => {
    const reloadPage = vi.fn()
    renderWrapper({ reloadPage })
    await settle(() => start.loaded.reject(LOAD_FAILURE))

    fireEvent.click(screen.getByRole('button', { name: 'Reload page' }))

    expect(reloadPage).toHaveBeenCalledTimes(1)
  })

  it('keeps the alert and asks the renderer loader no second time after Reload page is pressed', async () => {
    const loadFactory = vi.fn(() => start.loaded.promise)
    collaborators.loadFactory = loadFactory
    renderWrapper({ reloadPage: vi.fn() })
    await settle(() => start.loaded.reject(LOAD_FAILURE))

    fireEvent.click(screen.getByRole('button', { name: 'Reload page' }))
    await settle(() => {})

    expect(loadFactory).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert')).toHaveTextContent(PLAIN_COULD_NOT_LOAD)
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument()
    expect(screen.queryByTestId('canvas')).toBeNull()
    expect(await rejections.read()).toEqual([])
  })
})
