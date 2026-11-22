import { useEffect } from 'react'
import { render, screen } from '@testing-library/react'
import type { CanvasProps } from '@react-three/fiber'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PLAIN_CANNOT_RENDER } from './scene-failure-probe-test-support'
import { SceneRendererCanvas } from './scene-renderer-canvas'
import {
  buildFakeRenderer,
  defer,
  settle,
  type Deferred,
  type FakeRenderer,
} from './scene-renderer-canvas-test-support'

// The engine's loader and release function and the 3D library's Canvas are the collaborators of
// the wrapper. The release stub records which renderer it was asked to release, so each case
// counts identities and never inspects how or when the wrapper made the call.
const collaborators = vi.hoisted(() => ({
  loadFactory: (() => Promise.resolve(() => ({}))) as () => Promise<unknown>,
  released: [] as unknown[],
}))

vi.mock('../../engine', () => ({
  loadSceneRendererFactory: () => collaborators.loadFactory(),
  releaseSceneRenderer: (renderer: unknown) => {
    collaborators.released.push(renderer)
    return Promise.resolve()
  },
}))

// The stand-in Canvas builds its renderer through the supplied gl function, as the library does.
vi.mock('@react-three/fiber', () => ({
  // A component export legitimately keeps its PascalCase name in the mock.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  Canvas: ({ gl, children }: CanvasProps) => {
    useEffect(() => {
      if (typeof gl === 'function') gl({ canvas: document.createElement('canvas') } as never)
    }, [gl])
    return <div data-testid="canvas">{children}</div>
  },
}))

interface Session {
  built: FakeRenderer[]
  peakLive: () => number
  load: () => void
  started: Deferred<void>
}

// Every renderer the factory builds is noted, with the highest count of renderers that were built
// and not yet released at any moment of the run.
function arrangeSession(): Session {
  const built: FakeRenderer[] = []
  const started = defer<void>()
  const loaded = defer<unknown>()
  let peak = 0
  const factory = vi.fn(() => {
    const renderer = buildFakeRenderer(started)
    built.push(renderer)
    peak = Math.max(peak, built.length - collaborators.released.length)
    return renderer
  })
  collaborators.loadFactory = () => loaded.promise
  return {
    built,
    peakLive: () => peak,
    load: () => loaded.resolve(factory),
    started,
  }
}

function runningLoops(built: FakeRenderer[]): number {
  return built.filter((renderer) => renderer.running && !collaborators.released.includes(renderer))
    .length
}

describe('SceneRendererCanvas releasing the renderers it builds', () => {
  beforeEach(() => {
    collaborators.released = []
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('releases each renderer once and keeps none alive when the view opens and closes repeatedly', async () => {
    const openings = 3
    const built: FakeRenderer[] = []
    let peakLive = 0

    for (let opening = 0; opening < openings; opening += 1) {
      const session = arrangeSession()
      const view = render(<SceneRendererCanvas />)
      await settle(() => session.load())
      await settle(() => session.started.resolve())
      view.unmount()
      built.push(...session.built)
      peakLive = Math.max(peakLive, session.peakLive())
    }

    expect(built).toHaveLength(openings)
    expect(collaborators.released).toHaveLength(openings)
    expect(new Set(collaborators.released)).toEqual(new Set(built))
    expect(peakLive).toBeLessThanOrEqual(1)
    expect(runningLoops(built)).toBe(0)
  })

  it('releases the renderer once when the wrapper unmounts while init() is still pending', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const session = arrangeSession()
    const view = render(<SceneRendererCanvas />)
    await settle(() => session.load())

    view.unmount()
    await settle(() => session.started.resolve())

    expect(session.built).toHaveLength(1)
    expect(collaborators.released).toEqual(session.built)
    expect(warn).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })

  it('releases the renderer once while still mounted when init() rejects, and not again on unmount', async () => {
    const session = arrangeSession()
    const view = render(<SceneRendererCanvas />)
    await settle(() => session.load())
    await settle(() => session.started.reject(new Error('no usable GPU backend')))

    expect(screen.getByRole('status')).toHaveTextContent(PLAIN_CANNOT_RENDER)
    expect(collaborators.released).toEqual(session.built)
    expect(session.built).toHaveLength(1)

    view.unmount()

    expect(collaborators.released).toEqual(session.built)
  })

  it('builds and releases nothing when the wrapper unmounts before the factory loads', async () => {
    const session = arrangeSession()
    const view = render(<SceneRendererCanvas />)

    view.unmount()
    await settle(() => session.load())

    expect(session.built).toHaveLength(0)
    expect(collaborators.released).toHaveLength(0)
  })
})
