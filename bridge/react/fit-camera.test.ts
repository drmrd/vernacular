import { describe, it, expect, vi } from 'vitest'
import { frameSceneCamera } from '../../core'
import type { Bounds3, CameraPose } from '../../core'
import { fitCameraToBounds, applyCameraPose } from './fit-camera'

interface RecordingCamera {
  fov?: number | undefined
  near: number
  far: number
  position: { set: ReturnType<typeof vi.fn> }
  up: { set: ReturnType<typeof vi.fn> }
  lookAt: ReturnType<typeof vi.fn>
  updateProjectionMatrix: ReturnType<typeof vi.fn>
}

function makeCamera(fov?: number): RecordingCamera {
  return {
    fov,
    near: 0,
    far: 0,
    position: { set: vi.fn() },
    up: { set: vi.fn() },
    lookAt: vi.fn(),
    updateProjectionMatrix: vi.fn(),
  }
}

// The x, y, z arguments of a spy's first call. A fixed three-tuple keeps the
// destructured components definite numbers under the strict tsconfig, and the
// zero fallback keeps a never-called spy from throwing here.
function firstCallXyz(spy: ReturnType<typeof vi.fn>): [number, number, number] {
  const [call] = spy.mock.calls
  return (call ?? [0, 0, 0]) as [number, number, number]
}

/** A realistic ten-by-eight-meter room about 2.7 meters tall, in millimeters. */
const bounds: Bounds3 = {
  min: { x: 0, y: 0, z: 0 },
  max: { x: 10000, y: 2700, z: 8000 },
}

const DEFAULT_FOV_DEGREES = 75
const degToRad = (degrees: number): number => (degrees * Math.PI) / 180

function distanceFromTarget(camera: RecordingCamera): number {
  const [px, py, pz] = firstCallXyz(camera.position.set)
  const [tx, ty, tz] = firstCallXyz(camera.lookAt)
  return Math.hypot(px - tx, py - ty, pz - tz)
}

describe('fitCameraToBounds', () => {
  it('applies the core-computed pose to the camera using the live size and field of view', () => {
    const camera = makeCamera(DEFAULT_FOV_DEGREES)
    const size = { width: 800, height: 400 }
    const expected = frameSceneCamera(bounds, {
      aspect: size.width / size.height,
      fovRadians: degToRad(DEFAULT_FOV_DEGREES),
    })

    fitCameraToBounds(camera, bounds, size)

    expect(camera.position.set).toHaveBeenCalledTimes(1)
    const [px, py, pz] = firstCallXyz(camera.position.set)
    expect(px).toBeCloseTo(expected.position.x)
    expect(py).toBeCloseTo(expected.position.y)
    expect(pz).toBeCloseTo(expected.position.z)

    expect(camera.near).toBeCloseTo(expected.near)
    expect(camera.far).toBeCloseTo(expected.far)

    expect(camera.lookAt).toHaveBeenCalledTimes(1)
    const [tx, ty, tz] = firstCallXyz(camera.lookAt)
    expect(tx).toBeCloseTo(expected.target.x)
    expect(ty).toBeCloseTo(expected.target.y)
    expect(tz).toBeCloseTo(expected.target.z)

    expect(camera.updateProjectionMatrix).toHaveBeenCalledTimes(1)
  })

  it('derives the aspect from the size so a narrower pane backs the camera farther away', () => {
    const wide = makeCamera(DEFAULT_FOV_DEGREES)
    const narrow = makeCamera(DEFAULT_FOV_DEGREES)

    fitCameraToBounds(wide, bounds, { width: 800, height: 300 })
    fitCameraToBounds(narrow, bounds, { width: 300, height: 800 })

    expect(distanceFromTarget(narrow)).toBeGreaterThan(distanceFromTarget(wide))
  })

  it('defaults to a seventy-five-degree field of view when the camera has none', () => {
    const camera = makeCamera(undefined)
    const size = { width: 800, height: 400 }
    const expected = frameSceneCamera(bounds, {
      aspect: size.width / size.height,
      fovRadians: degToRad(DEFAULT_FOV_DEGREES),
    })

    fitCameraToBounds(camera, bounds, size)

    const [px, py, pz] = firstCallXyz(camera.position.set)
    expect(px).toBeCloseTo(expected.position.x)
    expect(py).toBeCloseTo(expected.position.y)
    expect(pz).toBeCloseTo(expected.position.z)
    expect(camera.near).toBeCloseTo(expected.near)
    expect(camera.far).toBeCloseTo(expected.far)
  })

  it('resets the camera up to world up so a framed view is always upright', () => {
    const camera = makeCamera(DEFAULT_FOV_DEGREES)

    fitCameraToBounds(camera, bounds, { width: 800, height: 400 })

    expect(camera.up.set).toHaveBeenCalledTimes(1)
    const [ux, uy, uz] = firstCallXyz(camera.up.set)
    expect(ux).toBe(0)
    expect(uy).toBe(1)
    expect(uz).toBe(0)
  })
})

describe('applyCameraPose', () => {
  /** A tilted pose with an explicit up, so the assertions read off real values. */
  const pose: CameraPose = {
    position: { x: 1000, y: 2000, z: 3000 },
    target: { x: 100, y: 200, z: 300 },
    near: 50,
    far: 9000,
    up: { x: 0, y: 0, z: -1 },
  }

  it('snaps the camera to the explicit pose', () => {
    const camera = makeCamera(DEFAULT_FOV_DEGREES)

    applyCameraPose(camera, pose)

    expect(camera.position.set).toHaveBeenCalledTimes(1)
    const [px, py, pz] = firstCallXyz(camera.position.set)
    expect(px).toBe(pose.position.x)
    expect(py).toBe(pose.position.y)
    expect(pz).toBe(pose.position.z)

    expect(camera.near).toBe(pose.near)
    expect(camera.far).toBe(pose.far)

    expect(camera.lookAt).toHaveBeenCalledTimes(1)
    const [tx, ty, tz] = firstCallXyz(camera.lookAt)
    expect(tx).toBe(pose.target.x)
    expect(ty).toBe(pose.target.y)
    expect(tz).toBe(pose.target.z)

    expect(camera.up.set).toHaveBeenCalledTimes(1)
    const [ux, uy, uz] = firstCallXyz(camera.up.set)
    expect(ux).toBe(0)
    expect(uy).toBe(0)
    expect(uz).toBe(-1)

    expect(camera.updateProjectionMatrix).toHaveBeenCalledTimes(1)
  })

  it('falls back to world up when the pose omits its up vector', () => {
    const camera = makeCamera(DEFAULT_FOV_DEGREES)
    const uprightPose: CameraPose = {
      position: { x: 1000, y: 2000, z: 3000 },
      target: { x: 100, y: 200, z: 300 },
      near: 50,
      far: 9000,
    }

    applyCameraPose(camera, uprightPose)

    expect(camera.up.set).toHaveBeenCalledTimes(1)
    const [ux, uy, uz] = firstCallXyz(camera.up.set)
    expect(ux).toBe(0)
    expect(uy).toBe(1)
    expect(uz).toBe(0)
  })
})
