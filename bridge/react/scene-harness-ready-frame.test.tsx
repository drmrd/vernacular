import { act, cleanup, render, screen } from '@testing-library/react'
import { Children, isValidElement, useEffect, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SceneHarnessView } from './scene-harness-view'

// The harness's collaborators: the 3D library's state, a renderer with its own animation
// loop, the lighting readiness the test settles, and a count of drawn frames. The renderer
// stand-in holds one loop, the way three's renderer does, and runs it once per frame.
const harness = vi.hoisted(() => {
  let loop: (() => void) | null = null
  const renderer = {
    setAnimationLoop: (callback: (() => void) | null) => {
      loop = callback
    },
    getAnimationLoop: () => loop,
  }
  return {
    runFrame: () => loop?.(),
    resetLoop: () => {
      loop = null
    },
    state: { gl: renderer, scene: {}, camera: {}, size: { width: 320, height: 240 } },
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
  // eslint-disable-next-line @typescript-eslint/naming-convention
  SceneRendererCanvas: ({ children }: { children: ReactNode }) => (
    <>
      {Children.toArray(children).filter(
        (child) => isValidElement(child) && typeof child.type !== 'string',
      )}
    </>
  ),
}))

vi.mock('./scene-lighting', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention
  SceneLighting: ({ onReady }: { onReady: () => void }) => {
    useEffect(() => {
      harness.settleLighting = onReady
    }, [onReady])
    return null
  },
}))

vi.mock('./fit-camera', () => ({ fitCameraToBounds: () => {}, applyCameraPose: () => {} }))

vi.mock('../../engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../engine')>()),
  renderSceneFrame: () => {
    harness.draws += 1
  },
}))

function readiness(): string | null {
  return screen.getByTestId('scene-harness').getAttribute('data-harness-ready')
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

  it('keeps data-harness-ready false until the ready frame has been drawn in the animation loop', async () => {
    render(<SceneHarnessView />)
    await settleLighting()

    expect(readiness()).toBe('false')
    runFrame()
    expect(readiness()).toBe('true')
  })
})
