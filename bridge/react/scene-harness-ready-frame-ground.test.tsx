import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { groundPlaneDrawsWith, isGroundPlane } from '../../engine'
import type { SceneRoot } from '../../engine'
import { Texture } from '../../engine/testing'
import { heldGrassAppearance } from './ground-plane-test-support'
import type { TextureState } from './texture-cache'
import { SceneHarnessView } from './scene-harness-view'
import {
  harness,
  readiness,
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
  return { status: 'ready', appearance: heldGrassAppearance(new Texture()) }
}

beforeEach(resetHarness)

afterEach(cleanup)

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

  it('turns ready with the frames drawn after the grass is on the plane', async () => {
    const { rerender } = render(<SceneHarnessView />)
    await settleLighting()
    runFrame()

    const ground = readyGround()
    harness.groundTexture = ground
    rerender(<SceneHarnessView />)

    expect(groundTextureStatus()).toBe('ready')
    expect(readiness()).toBe('false')
    runSettleAndReadyFrames()
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
    runSettleAndReadyFrames()
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
    runSettleAndReadyFrames()
    expect(readiness()).toBe('true')
    expect(groundTextureStatus()).toBe('ready')
  })
})
