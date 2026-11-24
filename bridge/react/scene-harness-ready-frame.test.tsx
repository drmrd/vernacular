import { act, cleanup, render, screen } from '@testing-library/react'
import { Children, isValidElement, useEffect, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { groundPlaneDrawsWith, isGroundPlane, markCacheHeld } from '../../engine'
import type { SceneRoot } from '../../engine'
import { Texture } from '../../engine/testing'
import type { TextureState } from './texture-cache'
import { SceneHarnessView } from './scene-harness-view'

// The harness's collaborators: the 3D library's state, a renderer with its own animation
// loop, the lighting readiness the test settles, and a count of drawn frames. The renderer
// stand-in holds one loop and resets its per-frame counts as each frame starts, then calls
// the loop, the way three's renderer does. The ground texture state stays one object until a
// test replaces it, as the real hook's cache does.
const harness = vi.hoisted(() => {
  const CANVAS_WIDTH = 320
  const CANVAS_HEIGHT = 240
  const info = { render: { frameCalls: 0, drawCalls: 0 } }
  let loop: (() => void) | null = null
  const flatLawn: TextureState = { status: 'failed' }
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
    drawnRoot: undefined as object | undefined,
    settleLighting: undefined as (() => void) | undefined,
    flatLawn,
    groundTexture: flatLawn as TextureState,
  }
})

vi.mock('./use-ground-texture', () => ({ useGroundTexture: () => harness.groundTexture }))

vi.mock('@react-three/fiber', () => ({
  useThree: (select?: (state: typeof harness.state) => unknown) =>
    select ? select(harness.state) : harness.state,
  useFrame: () => {},
}))

// Renders the canvas children without a canvas, leaving out the 3D library's own elements.
// The scene root a primitive element mounts is kept as the drawn root.
vi.mock('./scene-renderer-canvas', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the mock key must equal the name of the component export
  SceneRendererCanvas: ({ children }: { children: ReactNode }) => {
    const elements = Children.toArray(children).filter(isValidElement)
    for (const element of elements) {
      if (element.type === 'primitive') {
        harness.drawnRoot = (element.props as { object: object }).object
      }
    }
    return <>{elements.filter((element) => typeof element.type !== 'string')}</>
  },
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
const TILE_SIZE_MM = 2000

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

function drawnGroundPlane() {
  const root = harness.drawnRoot as SceneRoot
  const [plane] = root.children.filter((child) => isGroundPlane(child))
  if (!plane) throw new Error('the drawn root has no ground plane')
  return plane
}

function groundTextureStatus(): string | null {
  return screen.getByTestId('scene-harness').getAttribute('data-ground-texture')
}

function readyGround(): TextureState {
  const texture = new Texture()
  markCacheHeld(texture)
  return {
    status: 'ready',
    appearance: { texture, tileSize: { width: TILE_SIZE_MM, height: TILE_SIZE_MM } },
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
  harness.groundTexture = harness.flatLawn
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

  describe('the harness turns ready only with a frame drawn after the ground has settled, and reports the ground status', () => {
    beforeEach(() => {
      harness.groundTexture = { status: 'loading' }
    })

    it('stays not ready while the ground loads, however many frames run', async () => {
      render(<SceneHarnessView />)
      await settleLighting()
      runFrame()
      runFrame()

      expect(readiness()).toBe('false')
      expect(groundTextureStatus()).toBe('loading')
    })

    it('turns ready with the first frame drawn after the grass is on the plane', async () => {
      const { rerender } = render(<SceneHarnessView />)
      await settleLighting()
      runFrame()

      const ground = readyGround()
      harness.groundTexture = ground
      rerender(<SceneHarnessView />)

      expect(groundTextureStatus()).toBe('ready')
      expect(readiness()).toBe('false')
      runFrame()
      expect(readiness()).toBe('true')
      expect(groundPlaneDrawsWith(drawnGroundPlane(), ground.appearance)).toBe(true)
    })

    it('turns ready over the flat lawn when the ground fails, and says so', async () => {
      const { rerender } = render(<SceneHarnessView />)
      await settleLighting()
      runFrame()

      harness.groundTexture = { status: 'failed' }
      rerender(<SceneHarnessView />)

      expect(readiness()).toBe('false')
      runFrame()
      expect(readiness()).toBe('true')
      expect(groundTextureStatus()).toBe('failed')
    })

    it('waits for a frame drawn after the lighting settled when the ground settles first', async () => {
      const { rerender } = render(<SceneHarnessView />)
      harness.groundTexture = readyGround()
      rerender(<SceneHarnessView />)
      runFrame()

      expect(readiness()).toBe('false')
      await settleLighting()
      expect(readiness()).toBe('false')
      runFrame()
      expect(readiness()).toBe('true')
      expect(groundTextureStatus()).toBe('ready')
    })
  })
})
