import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SceneHarnessView } from './scene-harness-view'
import {
  harness,
  readiness,
  readyFrameCalls,
  resetHarness,
  runFrame,
  runSettleAndReadyFrames,
  settleLighting,
} from './scene-harness-view-test-support'

vi.mock('./use-ground-texture', async () =>
  (await import('./scene-harness-view-test-support')).groundTextureModule(),
)
vi.mock('@react-three/fiber', async () =>
  (await import('./scene-harness-view-test-support')).fiberModule(),
)
vi.mock('./scene-renderer-canvas', async () =>
  (await import('./scene-harness-view-test-support')).rendererCanvasModule(),
)
vi.mock('./scene-lighting', async () =>
  (await import('./scene-harness-view-test-support')).lightingModule(),
)
vi.mock('./fit-camera', async () =>
  (await import('./scene-harness-view-test-support')).cameraModule(),
)
vi.mock('../../engine', async (importOriginal) =>
  (await import('./scene-harness-view-test-support')).engineWithCountedFrames(
    await importOriginal<typeof import('../../engine')>(),
  ),
)

const READY_RENDER_CALLS = 5
const FRAMES_AFTER_READY = 3
const READY_DRAW_CALLS = 127
const ENVIRONMENT_FILTER_RENDER_CALLS = 13

beforeEach(resetHarness)

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
    runSettleAndReadyFrames()
    const drawsAtReady = harness.draws

    for (let frame = 0; frame < FRAMES_AFTER_READY; frame += 1) runFrame()

    expect(harness.draws).toBe(drawsAtReady)
    expect(readiness()).toBe('true')
  })

  it('keeps data-harness-ready false until the ready frame has been drawn in the animation loop', async () => {
    render(<SceneHarnessView />)
    await settleLighting()

    expect(readiness()).toBe('false')
    runSettleAndReadyFrames()
    expect(readiness()).toBe('true')
  })

  it('draws a settle frame first and turns ready only with the frame after it', async () => {
    render(<SceneHarnessView />)
    await settleLighting()

    runFrame()
    expect(readiness()).toBe('false')
    runFrame()
    expect(readiness()).toBe('true')
  })

  it('reports the counts of the frame after one-time work, not of the settle frame that did it', async () => {
    harness.oneTimeRenderCalls = ENVIRONMENT_FILTER_RENDER_CALLS
    render(<SceneHarnessView />)
    await settleLighting()
    runSettleAndReadyFrames()

    expect(readyFrameCalls().renderCalls).toBe(String(READY_RENDER_CALLS))
  })

  it('stays not ready when a frame is drawn before the lighting settles', async () => {
    render(<SceneHarnessView />)
    runFrame()

    expect(readiness()).toBe('false')
    await settleLighting()
    expect(readiness()).toBe('false')
    runSettleAndReadyFrames()
    expect(readiness()).toBe('true')
  })

  // The junctions scene, like the default shell, is schematic (no environment, so no
  // ambient-occlusion pipeline is built), and its walls-only geometry differs from the shell.
  it("reports not ready again when the scene changes, until the new scene's ready frame is drawn", async () => {
    const { rerender } = render(<SceneHarnessView />)
    await settleLighting()
    runSettleAndReadyFrames()
    expect(readiness()).toBe('true')

    rerender(<SceneHarnessView scene="junctions" />)
    expect(readiness()).toBe('false')
    runFrame()
    expect(readiness()).toBe('false')
    await settleLighting()
    runSettleAndReadyFrames()
    expect(readiness()).toBe('true')
  })

  it('reports the render and draw calls of the ready frame on the harness', async () => {
    render(<SceneHarnessView />)
    await settleLighting()
    runSettleAndReadyFrames()

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
