import { cleanup, render } from '@testing-library/react'
import { StrictMode, type ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { Vector3 } from '../../core'
import { OrbitCameraControls } from './orbit-camera-controls'

interface FakeController {
  pivot: Vector3
  setTarget: Mock<(target: Vector3) => void>
  getTarget: () => Vector3
  setEnabled: Mock<(enabled: boolean) => void>
  update: Mock<() => void>
  dispose: Mock<() => void>
}

const CAMERA_POSITION: Vector3 = { x: 4000, y: 3000, z: 9000 }
const FRAMED_TARGET: Vector3 = { x: 2000, y: 1200, z: -1500 }
const PANNED_TARGET: Vector3 = { x: 2600, y: 900, z: -400 }
const SAVED_TARGET: Vector3 = { x: -700, y: 1100, z: -2500 }
const PRESET_TARGET: Vector3 = { x: 300, y: 50, z: 800 }

// The 3D library's hooks and the engine's controller are the collaborators of the wrapper.
// A fake controller that remembers its pivot lets each test read where the wrapper put it
// without a canvas or a GPU.
const collaborators = vi.hoisted(() => ({
  threeState: {
    camera: { position: { x: 4000, y: 3000, z: 9000 } },
    gl: { domElement: document.createElement('div') },
  } as Record<string, unknown>,
  controllers: [] as FakeController[],
}))

vi.mock('@react-three/fiber', () => ({
  useThree: (select: (state: Record<string, unknown>) => unknown) =>
    select(collaborators.threeState),
}))

vi.mock('../../engine', () => ({
  createOrbitController: () => {
    const fake: FakeController = {
      pivot: { x: 0, y: 0, z: 0 },
      setTarget: vi.fn((target: Vector3) => {
        fake.pivot = { ...target }
      }),
      getTarget: () => ({ ...fake.pivot }),
      setEnabled: vi.fn(),
      update: vi.fn(),
      dispose: vi.fn(),
    }
    collaborators.controllers.push(fake)
    return fake
  },
}))

type ControlsProps = ComponentProps<typeof OrbitCameraControls>

const controlsProps = (overrides: Partial<ControlsProps> = {}): ControlsProps => ({
  enabled: true,
  initialTarget: FRAMED_TARGET,
  target: FRAMED_TARGET,
  onUserControl: vi.fn(),
  onLeave: vi.fn(),
  ...overrides,
})

const latestController = (): FakeController => {
  const controller = collaborators.controllers.at(-1)
  if (controller === undefined) throw new Error('the wrapper built no controller')
  return controller
}

const everyTargetSet = (): Vector3[] =>
  collaborators.controllers.flatMap((controller) =>
    controller.setTarget.mock.calls.map(([target]) => target),
  )

describe('OrbitCameraControls', () => {
  beforeEach(() => {
    collaborators.controllers.length = 0
  })

  afterEach(cleanup)

  it('reports where the camera stood and the pivot it turned around when the pane unmounts', () => {
    const onLeave = vi.fn()
    const { unmount } = render(<OrbitCameraControls {...controlsProps({ onLeave })} />)
    latestController().pivot = PANNED_TARGET

    unmount()

    expect(onLeave).toHaveBeenLastCalledWith({
      position: CAMERA_POSITION,
      orbitTarget: PANNED_TARGET,
    })
  })

  it('starts on the saved pivot, not on the target the pane asks for, when it mounts again', () => {
    render(
      <StrictMode>
        <OrbitCameraControls
          {...controlsProps({ initialTarget: SAVED_TARGET, target: FRAMED_TARGET })}
        />
      </StrictMode>,
    )

    expect(latestController().getTarget()).toEqual(SAVED_TARGET)
    expect(everyTargetSet()).not.toContainEqual(FRAMED_TARGET)
  })

  it('moves to a new target when the target changes', () => {
    const { rerender } = render(<OrbitCameraControls {...controlsProps()} />)

    rerender(<OrbitCameraControls {...controlsProps({ target: PRESET_TARGET })} />)

    expect(latestController().getTarget()).toEqual(PRESET_TARGET)
  })
})
