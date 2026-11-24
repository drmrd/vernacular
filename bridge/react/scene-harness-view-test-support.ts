import { act, screen } from '@testing-library/react'
import { Children, createElement, Fragment, isValidElement, useEffect, type ReactNode } from 'react'
import type { HarnessRenderer } from './scene-harness-ready-frame'
import type { TextureState } from './texture-cache'

export interface StandInRenderer extends HarnessRenderer {
  runFrame(): void
}

// The loop runner resets the counts at the start of each frame, then calls the loop, the way
// three's renderer does; a draw sets the counts of the frame it runs in.
export function createStandInRenderer(): StandInRenderer {
  let loop: (() => void) | null = null
  const info = { render: { frameCalls: 0, drawCalls: 0 } }
  return {
    info,
    setAnimationLoop(callback) {
      loop = callback
    },
    getAnimationLoop() {
      return loop
    },
    runFrame() {
      info.render.frameCalls = 0
      info.render.drawCalls = 0
      loop?.()
    },
  }
}

// The harness's collaborators for the view tests: the 3D library's state, a renderer with its
// own animation loop, the lighting readiness the test settles, and a count of drawn frames. The
// renderer stand-in holds one loop and resets its per-frame counts as each frame starts, then
// calls the loop, the way three's renderer does. The ground texture state stays one object until
// a test replaces it, as the real hook's cache does. A test file mocks its collaborators with the
// module factories below, because vi.mock is hoisted per file.
const CANVAS_WIDTH = 320
const CANVAS_HEIGHT = 240
const FRAME_RENDER_CALLS = 5
const FRAME_DRAW_CALLS = 127

const renderer = createStandInRenderer()
// The default ground state, so a test does not wait on a load.
const failedGround: TextureState = { status: 'failed' }

export const harness = {
  info: renderer.info,
  runFrame: () => renderer.runFrame(),
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
  // Render calls the next drawn frame carries once on top of a plain frame: the one-time work
  // of three's environment-map filter. The frame that carries it clears it.
  oneTimeRenderCalls: 0,
  drawnRoot: undefined as object | undefined,
  settleLighting: undefined as (() => void) | undefined,
  groundTexture: failedGround as TextureState,
}

export function resetHarness(): void {
  harness.draws = 0
  harness.oneTimeRenderCalls = 0
  harness.settleLighting = undefined
  harness.groundTexture = failedGround
  renderer.setAnimationLoop(null)
}

export function groundTextureModule() {
  return { useGroundTexture: () => harness.groundTexture }
}

export function fiberModule() {
  return {
    useThree: (select?: (state: typeof harness.state) => unknown) =>
      select ? select(harness.state) : harness.state,
    useFrame: () => {},
  }
}

// Renders the canvas children without a canvas, leaving out the 3D library's own elements.
// The scene root a primitive element mounts is kept as the drawn root.
export function rendererCanvasModule() {
  return {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- the mock key must equal the name of the component export
    SceneRendererCanvas: ({ children }: { children: ReactNode }) => {
      const elements = Children.toArray(children).filter(isValidElement)
      for (const element of elements) {
        if (element.type === 'primitive') {
          harness.drawnRoot = (element.props as { object: object }).object
        }
      }
      return createElement(
        Fragment,
        null,
        ...elements.filter((element) => typeof element.type !== 'string'),
      )
    },
  }
}

export function lightingModule() {
  return {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- the mock key must equal the name of the component export
    SceneLighting: ({ onReady }: { onReady: () => void }) => {
      useEffect(() => {
        harness.settleLighting = onReady
      }, [onReady])
      return null
    },
  }
}

export function cameraModule() {
  return { fitCameraToBounds: () => {}, applyCameraPose: () => {} }
}

// Each drawn frame counts once and adds the render and draw calls of a five-pass frame.
export function engineWithCountedFrames<Engine extends object>(original: Engine) {
  return {
    ...original,
    renderSceneFrame: () => {
      harness.draws += 1
      harness.info.render.frameCalls += FRAME_RENDER_CALLS + harness.oneTimeRenderCalls
      harness.oneTimeRenderCalls = 0
      harness.info.render.drawCalls += FRAME_DRAW_CALLS
    },
  }
}

export function readiness(): string | null {
  return screen.getByTestId('scene-harness').getAttribute('data-harness-ready')
}

export function readyFrameCalls(): { renderCalls: string | null; drawCalls: string | null } {
  const wrapper = screen.getByTestId('scene-harness')
  return {
    renderCalls: wrapper.getAttribute('data-harness-ready-render-calls'),
    drawCalls: wrapper.getAttribute('data-harness-ready-draw-calls'),
  }
}

export async function settleLighting(): Promise<void> {
  await act(async () => {
    harness.settleLighting?.()
    await Promise.resolve()
  })
}

export function runFrame(): void {
  act(() => harness.runFrame())
}

// With the gates open the first frame is the settle frame and the second is the ready frame.
export function runSettleAndReadyFrames(): void {
  runFrame()
  runFrame()
}
