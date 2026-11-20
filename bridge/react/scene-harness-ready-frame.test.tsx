import { act, cleanup, render, screen } from '@testing-library/react'
import { Children, isValidElement, useEffect, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SceneHarnessView } from './scene-harness-view'

// The harness's collaborators: the 3D library's state, a renderer with its own animation
// loop, the lighting readiness the test settles, and a count of drawn frames. The renderer
// stand-in holds one loop and resets its per-frame counts as each frame starts, then calls
// the loop, the way three's renderer does.
const harness = vi.hoisted(() => {
  const CANVAS_WIDTH = 320
  const CANVAS_HEIGHT = 240
  const info = { render: { frameCalls: 0, drawCalls: 0 } }
  let loop: (() => void) | null = null
  const renderer = {
    info,
    setAnimationLoop: (callback: (() => void) | null) => {
      loop = callback
    },
    getAnimationLoop: () => loop,
  }
  return {
    info,
    runFrame: () => {
      info.render.frameCalls = 0
      info.render.drawCalls = 0
      loop?.()
    },
    resetLoop: () => {
      loop = null
    },
    state: {
      gl: renderer,
      scene: {},
      camera: {},
      // The real library replaces `size` with a new, equal object on each parent render.
      get size() {
        return { width: CANVAS_WIDTH, height: CANVAS_HEIGHT }
      },
    },
    draws: 0,
    settleLighting: undefined as (() => void) | undefined,
  }
})

vi.mock('@react-three/fiber', () => ({
  useThree: (select?: (state: typeof harness.state) => unknown) =>
    select ? select(harness.state) : harness.state,
  useFrame: () => {},
}))

// Renders the canvas children without a canvas, leaving out the 3D library's own elements.
vi.mock('./scene-renderer-canvas', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the mock key must equal the name of the component export
  SceneRendererCanvas: ({ children }: { children: ReactNode }) => (
    <>
      {Children.toArray(children).filter(
        (child) => isValidElement(child) && typeof child.type !== 'string',
      )}
    </>
  ),
}))

vi.mock('./scene-lighting', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the mock key must equal the name of the component export
  SceneLighting: ({ onReady }: { onReady: () => void }) => {
    useEffect(() => {
      harness.settleLighting = onReady
    }, [onReady])
    return null
  },
}))

vi.mock('./fit-camera', () => ({ fitCameraToBounds: () => {}, applyCameraPose: () => {} }))

// Each drawn frame counts once and adds the render and draw calls of a five-pass frame.
vi.mock('../../engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../engine')>()),
  renderSceneFrame: () => {
    harness.draws += 1
    harness.info.render.frameCalls += 5
    harness.info.render.drawCalls += 127
  },
}))

const READY_RENDER_CALLS = 5
const FRAMES_AFTER_READY = 3
const READY_DRAW_CALLS = 127

function readiness(): string | null {
  return screen.getByTestId('scene-harness').getAttribute('data-harness-ready')
}

function readyFrameCalls(): { renderCalls: string | null; drawCalls: string | null } {
  const wrapper = screen.getByTestId('scene-harness')
  return {
    renderCalls: wrapper.getAttribute('data-harness-ready-render-calls'),
    drawCalls: wrapper.getAttribute('data-harness-ready-draw-calls'),
  }
}

async function settleLighting(): Promise<void> {
  await act(async () => {
    harness.settleLighting?.()
    await Promise.resolve()
  })
}

function runFrame(): void {
  act(() => harness.runFrame())
}

beforeEach(() => {
  harness.draws = 0
  harness.settleLighting = undefined
  harness.resetLoop()
})

afterEach(cleanup)

describe('SceneHarnessView ready frame', () => {
  it("draws no harness frame until the renderer's animation loop runs", async () => {
    render(<SceneHarnessView />)
    await settleLighting()

    expect(harness.draws).toBe(0)
  })

  it('draws one frame per animation-loop callback, however many commits asked for a draw before it', async () => {
    render(<SceneHarnessView />)
    await settleLighting()
    runFrame()

    expect(harness.draws).toBe(1)
  })

  it('draws no further frame once its ready frame is drawn', async () => {
    render(<SceneHarnessView />)
    await settleLighting()
    runFrame()
    const drawsAtReady = harness.draws

    for (let frame = 0; frame < FRAMES_AFTER_READY; frame += 1) runFrame()

    expect(harness.draws).toBe(drawsAtReady)
    expect(readiness()).toBe('true')
  })

  it('keeps data-harness-ready false until the ready frame has been drawn in the animation loop', async () => {
    render(<SceneHarnessView />)
    await settleLighting()

    expect(readiness()).toBe('false')
    runFrame()
    expect(readiness()).toBe('true')
  })

  it('stays not ready when a frame is drawn before the lighting settles', async () => {
    render(<SceneHarnessView />)
    runFrame()

    expect(readiness()).toBe('false')
    await settleLighting()
    expect(readiness()).toBe('false')
    runFrame()
    expect(readiness()).toBe('true')
  })

  // The junctions scene, like the default shell, is schematic (no environment, so no
  // ambient-occlusion pipeline is built), and its walls-only geometry differs from the shell.
  it("reports not ready again when the scene changes, until the new scene's ready frame is drawn", async () => {
    const { rerender } = render(<SceneHarnessView />)
    await settleLighting()
    runFrame()
    expect(readiness()).toBe('true')

    rerender(<SceneHarnessView scene="junctions" />)
    expect(readiness()).toBe('false')
    runFrame()
    expect(readiness()).toBe('false')
    await settleLighting()
    runFrame()
    expect(readiness()).toBe('true')
  })

  it('reports the render and draw calls of the ready frame on the harness', async () => {
    render(<SceneHarnessView />)
    await settleLighting()
    runFrame()

    expect(readyFrameCalls()).toEqual({
      renderCalls: String(READY_RENDER_CALLS),
      drawCalls: String(READY_DRAW_CALLS),
    })
  })

  it('leaves the render and draw call counts empty until the ready frame is drawn', async () => {
    render(<SceneHarnessView />)
    await settleLighting()

    expect(readyFrameCalls()).toEqual({ renderCalls: '', drawCalls: '' })
  })
})
