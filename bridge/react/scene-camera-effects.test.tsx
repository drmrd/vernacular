import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { Bounds3 } from '../../core'
import type { FramingBoxes } from './framed-scene'
import { FrameCamera } from './scene-camera-effects'

type Vec3Recorder = Mock<(x: number, y: number, z: number) => void>

interface RecordingCamera {
  fov: number
  near: number
  far: number
  position: { set: Vec3Recorder }
  up: { set: Vec3Recorder }
  lookAt: Vec3Recorder
  updateProjectionMatrix: Mock<() => void>
}

function makeCamera(): RecordingCamera {
  return {
    fov: 75,
    near: 0,
    far: 0,
    position: { set: vi.fn() },
    up: { set: vi.fn() },
    lookAt: vi.fn(),
    updateProjectionMatrix: vi.fn(),
  }
}

const collaborators = vi.hoisted(() => ({
  threeState: {} as Record<string, unknown>,
}))

// The 3D library's hooks are the only collaborator: a recording camera and a fixed viewport
// let each test read where the component put the camera without a canvas or a GPU.
vi.mock('@react-three/fiber', () => ({
  useThree: (select: (state: Record<string, unknown>) => unknown) =>
    select(collaborators.threeState),
}))

const VIEWPORT = { width: 800, height: 400 }
const PRECISION = 5

/** The box of the upper floor alone: what the fit and the axis presets frame. */
const UPPER: Bounds3 = {
  min: { x: 0, y: 3000, z: 0 },
  max: { x: 10000, y: 5700, z: 8000 },
}
/** The box of everything drawn, the floors below included: what the depth range covers. */
const DRAWN: Bounds3 = {
  min: { x: 0, y: 0, z: 0 },
  max: { x: 10000, y: 5700, z: 8000 },
}
const BOXES: FramingBoxes = { framingBounds: UPPER, bounds: DRAWN }

const UPPER_CENTER = { x: 5000, y: 4350, z: 4000 }
const UPPER_FIT_OFFSET = 6826.859092
const DRAWN_NEAR = 140.174891
const DRAWN_FAR = 56069.956305

function useRecordingCamera(): RecordingCamera {
  const camera = makeCamera()
  collaborators.threeState = { camera, size: VIEWPORT }
  return camera
}

function firstCallXyz(spy: Vec3Recorder): [number, number, number] {
  const [call] = spy.mock.calls
  return (call ?? [Number.NaN, Number.NaN, Number.NaN]) as [number, number, number]
}

function expectXyz(actual: [number, number, number], expected: [number, number, number]): void {
  expected.forEach((value, index) => expect(actual[index]).toBeCloseTo(value, PRECISION))
}

afterEach(cleanup)

describe('FrameCamera', () => {
  it('fits the framing box to the viewport', () => {
    const camera = useRecordingCamera()

    render(<FrameCamera boxes={BOXES} active />)

    expectXyz(firstCallXyz(camera.lookAt), [UPPER_CENTER.x, UPPER_CENTER.y, UPPER_CENTER.z])
    expectXyz(firstCallXyz(camera.position.set), [
      UPPER_CENTER.x + UPPER_FIT_OFFSET,
      UPPER_CENTER.y + UPPER_FIT_OFFSET,
      UPPER_CENTER.z + UPPER_FIT_OFFSET,
    ])
  })

  it('takes the near and far planes from the drawn box', () => {
    const camera = useRecordingCamera()

    render(<FrameCamera boxes={BOXES} active />)

    expect(camera.near).toBeCloseTo(DRAWN_NEAR, PRECISION)
    expect(camera.far).toBeCloseTo(DRAWN_FAR, PRECISION)
  })

  it('leaves the camera alone while the user has it', () => {
    const camera = useRecordingCamera()

    render(<FrameCamera boxes={BOXES} active={false} />)

    expect(camera.position.set).not.toHaveBeenCalled()
  })
})
