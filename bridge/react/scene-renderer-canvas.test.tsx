import { useEffect, type ReactNode } from 'react'
import { act, render, screen } from '@testing-library/react'
import type { CanvasProps, GLProps } from '@react-three/fiber'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SceneRendererCanvas } from './scene-renderer-canvas'

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void }

function defer<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((done) => (resolve = done))
  return { promise, resolve }
}

// The engine's loader and the 3D library's Canvas are the two collaborators of the wrapper.
// Each case decides when the factory loads and when the renderer's init() settles, so the
// start-up order is held by the test and not by timing.
const collaborators = vi.hoisted(() => ({
  loadFactory: (() => Promise.resolve(() => ({}))) as () => Promise<unknown>,
  canvasProps: [] as Array<Record<string, unknown>>,
}))

vi.mock('../../engine', () => ({
  loadSceneRendererFactory: () => collaborators.loadFactory(),
}))

// The stand-in Canvas records every render's props, renders its children as the real one does
// once its scene is ready, and builds its renderer through the supplied gl function, again only
// when that function changes, as the library does for a changed renderer factory.
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

async function settle(resolve: () => void): Promise<void> {
  await act(async () => {
    resolve()
    await Promise.resolve()
  })
}

function glOfRender(index: number): GLProps {
  return collaborators.canvasProps[index]?.gl as GLProps
}

function latestCanvasProps(): Record<string, unknown> {
  return collaborators.canvasProps[collaborators.canvasProps.length - 1] ?? {}
}

const CHILD = <div data-testid="child" />

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
    renderWrapper({ frameloop: 'demand' })
    await settle(() => start.loaded.resolve(start.factory))
    await settle(() => start.initialized.resolve())

    expect(latestCanvasProps().frameloop).toBe('demand')
    expect(screen.getByTestId('child')).toBeInTheDocument()
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
