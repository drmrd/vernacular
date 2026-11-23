import { act, cleanup, render } from '@testing-library/react'
import { useEffect, type ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { WalkState } from '../../core'
import { openPartsWith } from '../open-parts-test-support'
import {
  FLOOR_B_ID,
  twoFloorEnvironment,
  type TwoFloorEnvironment,
} from './use-opening-motion-floors-test-support'
import { WalkCameraControls } from './walk-camera-controls'

type FrameCallback = (state: never, delta: number) => void

// The 3D library's hooks are the collaborators of the controls. Frame subscribers are kept
// while mounted and `drawFrame` runs them the way a drawn frame does; `useThree` selects from
// a fake state whose scene records what the controls add and remove.
const collaborators = vi.hoisted(() => ({
  subscribers: new Set<{ current: (state: never, delta: number) => void }>(),
  threeState: {
    camera: {
      position: { x: 0, y: 0, z: 0, set: vi.fn() },
      matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
      updateWorldMatrix: vi.fn(),
      lookAt: vi.fn(),
    },
    gl: { domElement: document.createElement('canvas') },
    scene: { add: vi.fn(), remove: vi.fn() },
  } as Record<string, unknown> & { scene: { add: Mock; remove: Mock } },
}))

vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: FrameCallback) => {
    useEffect(() => {
      const subscriber = { current: callback }
      collaborators.subscribers.add(subscriber)
      return () => {
        collaborators.subscribers.delete(subscriber)
      }
    })
  },
  useThree: (select: (state: Record<string, unknown>) => unknown) =>
    select(collaborators.threeState),
}))

interface DrawnOutline {
  name: string
  children: { geometry: { getAttribute(name: string): { array: ArrayLike<number> } } }[]
}

type ControlsProps = ComponentProps<typeof WalkCameraControls>

// 1000 millimeters in front of the door of either floor, facing it.
const POSE_BEFORE_DOOR: WalkState = {
  position: { x: 2000, y: 1700, z: 1000 },
  yaw: 0,
  pitch: 0,
}
const FLOOR_B_ELEVATION_MM = 3000

function drawFrame(delta = 0) {
  act(() => {
    for (const subscriber of collaborators.subscribers) {
      subscriber.current(undefined as never, delta)
    }
  })
}

function outlineGroup(): DrawnOutline {
  const call = collaborators.threeState.scene.add.mock.calls[0] as [DrawnOutline] | undefined
  if (call === undefined) throw new Error('the controls added no outline group to the scene')
  return call[0]
}

function lowestHeight(group: DrawnOutline): number {
  const corners = Array.from(group.children[0]?.geometry.getAttribute('position').array ?? [])
  return Math.min(...corners.filter((_value, index) => index % 3 === 1))
}

describe('WalkCameraControls aim outline', () => {
  let env: TwoFloorEnvironment
  let root: ReturnType<TwoFloorEnvironment['buildRoot']>

  beforeEach(() => {
    env = twoFloorEnvironment('floor')
    root = env.buildRoot()
    collaborators.threeState.scene.add.mockClear()
    collaborators.threeState.scene.remove.mockClear()
  })

  afterEach(() => {
    cleanup()
    collaborators.subscribers.clear()
  })

  function controlsProps(overrides: Partial<ControlsProps> = {}): ControlsProps {
    return {
      enabled: true,
      aimGuide: true,
      onUserControl: vi.fn(),
      root,
      savedWalkPose: POSE_BEFORE_DOOR,
      onWalkPose: vi.fn(),
      storedOpenDoorIds: openPartsWith({}),
      onOpenDoors: vi.fn(),
      ...overrides,
    }
  }

  function renderControls(overrides: Partial<ControlsProps> = {}) {
    const view = render(<WalkCameraControls {...controlsProps(overrides)} />, {
      wrapper: env.wrapper,
    })
    const showWith = (next: Partial<ControlsProps>) => {
      view.rerender(<WalkCameraControls {...controlsProps({ ...overrides, ...next })} />)
    }
    return { ...view, showWith }
  }

  it('adds its outline group to the scene and takes it away on unmount', () => {
    const { unmount } = renderControls()

    expect(collaborators.threeState.scene.add).toHaveBeenCalledTimes(1)
    expect(outlineGroup().name).toBe('aim-outline')
    expect(collaborators.threeState.scene.remove).not.toHaveBeenCalled()

    unmount()

    expect(collaborators.threeState.scene.remove).toHaveBeenCalledTimes(1)
    expect(collaborators.threeState.scene.remove).toHaveBeenCalledWith(outlineGroup())
  })

  it('outlines the door in reach after a drawn frame', () => {
    renderControls()

    drawFrame()

    expect(outlineGroup().children).toHaveLength(1)
    expect(lowestHeight(outlineGroup())).toBe(0)
  })

  it('shows no outline while the aim guide is off', () => {
    const { showWith } = renderControls()
    drawFrame()

    showWith({ aimGuide: false })
    drawFrame()

    expect(outlineGroup().children).toHaveLength(0)

    showWith({ aimGuide: true })
    drawFrame()

    expect(outlineGroup().children).toHaveLength(1)
  })

  it('shows no outline outside walk mode', () => {
    renderControls({ enabled: false })

    drawFrame()

    expect(outlineGroup().children).toHaveLength(0)
  })

  it('shows no outline when the walker faces away', () => {
    renderControls({ savedWalkPose: { ...POSE_BEFORE_DOOR, yaw: Math.PI } })

    drawFrame()

    expect(outlineGroup().children).toHaveLength(0)
  })

  it("outlines the door of the active floor at that floor's height", () => {
    renderControls()

    act(() => {
      env.activeFloor.setActiveFloorId(FLOOR_B_ID)
    })
    drawFrame()

    expect(outlineGroup().children).toHaveLength(1)
    expect(lowestHeight(outlineGroup())).toBe(FLOOR_B_ELEVATION_MM)
  })
})
