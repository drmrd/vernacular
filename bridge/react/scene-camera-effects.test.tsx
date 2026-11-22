import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { Bounds3, CameraPose, OpeningSceneNode } from '../../core'
import type { FramingBoxes } from './framed-scene'
import { FrameCamera, PresetCamera, type DoorwayStand } from './scene-camera-effects'

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
const UPPER_NORTH_Z = -7824.466803
const UPPER_FLOOR_ELEVATION_MM = 3000

function installRecordingCamera(): RecordingCamera {
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
    const camera = installRecordingCamera()

    render(<FrameCamera boxes={BOXES} active />)

    expectXyz(firstCallXyz(camera.lookAt), [UPPER_CENTER.x, UPPER_CENTER.y, UPPER_CENTER.z])
    expectXyz(firstCallXyz(camera.position.set), [
      UPPER_CENTER.x + UPPER_FIT_OFFSET,
      UPPER_CENTER.y + UPPER_FIT_OFFSET,
      UPPER_CENTER.z + UPPER_FIT_OFFSET,
    ])
  })

  it('takes the near and far planes from the drawn box', () => {
    const camera = installRecordingCamera()

    render(<FrameCamera boxes={BOXES} active />)

    expect(camera.near).toBeCloseTo(DRAWN_NEAR, PRECISION)
    expect(camera.far).toBeCloseTo(DRAWN_FAR, PRECISION)
  })

  it('leaves the camera alone while the user has it', () => {
    const camera = installRecordingCamera()

    render(<FrameCamera boxes={BOXES} active={false} />)

    expect(camera.position.set).not.toHaveBeenCalled()
  })
})

const NORTH_REQUEST = { preset: 'north', nonce: 1 } as const

function renderPreset(
  request: { preset: 'north' | 'doorway'; nonce: number },
  doorway: DoorwayStand | null = null,
): { onApplied: Mock<(pose: CameraPose) => void> } {
  const onApplied = vi.fn<(pose: CameraPose) => void>()
  render(<PresetCamera request={request} boxes={BOXES} doorway={doorway} onApplied={onApplied} />)
  return { onApplied }
}

const UPPER_DOOR: OpeningSceneNode = {
  id: 'door-north',
  kind: 'opening',
  floorId: 'floor-2',
  type: 'door',
  center: { x: 2000, y: 0 },
  along: { x: 1, y: 0 },
  normal: { x: 0, y: -1 },
  width: 900,
  height: 2032,
  sillHeight: 0,
  hostThickness: 150,
  orientation: { hinge: 'start', facing: 'positive' },
}

describe('PresetCamera', () => {
  it('frames the north preset on the framing box', () => {
    const camera = installRecordingCamera()

    renderPreset(NORTH_REQUEST)

    expectXyz(firstCallXyz(camera.position.set), [UPPER_CENTER.x, UPPER_CENTER.y, UPPER_NORTH_Z])
    expectXyz(firstCallXyz(camera.lookAt), [UPPER_CENTER.x, UPPER_CENTER.y, UPPER_CENTER.z])
  })

  it('takes the preset depth range from the drawn box', () => {
    const camera = installRecordingCamera()

    const { onApplied } = renderPreset(NORTH_REQUEST)

    expect(camera.far).toBeCloseTo(DRAWN_FAR, PRECISION)
    expect(onApplied).toHaveBeenCalledTimes(1)
    expect(onApplied.mock.calls[0]?.[0].far).toBeCloseTo(DRAWN_FAR, PRECISION)
  })

  it('takes the doorway depth range from the drawn box', () => {
    const camera = installRecordingCamera()
    const doorway = { opening: UPPER_DOOR, floorElevationMm: UPPER_FLOOR_ELEVATION_MM }

    renderPreset({ preset: 'doorway', nonce: 1 }, doorway)

    expect(camera.far).toBeCloseTo(DRAWN_FAR, PRECISION)
    expect(camera.near).toBeCloseTo(DRAWN_NEAR, PRECISION)
  })
})
