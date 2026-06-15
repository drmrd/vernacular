import { describe, it, expect } from 'vitest'
import type { Bounds3 } from './vector3'
import {
  frameSceneCamera,
  DEFAULT_CAMERA_POSE,
  type CameraPose,
  type CameraViewport,
} from './camera-framing'
import { cameraPresetPose } from './camera-presets'

const houseBounds: Bounds3 = {
  min: { x: 0, y: 0, z: 0 },
  max: { x: 4000, y: 2438, z: 3000 },
}

const CENTER = { x: 2000, y: 1219, z: 1500 }
const VIEWPORT: CameraViewport = { aspect: 16 / 9, fovRadians: (75 * Math.PI) / 180 }
const POSITION_TOLERANCE = 1e-6
const FILL_FRACTION = 0.8

function diagonalOf(bounds: Bounds3): number {
  return Math.hypot(
    bounds.max.x - bounds.min.x,
    bounds.max.y - bounds.min.y,
    bounds.max.z - bounds.min.z,
  )
}

function limitingHalfAngle(viewport: CameraViewport): number {
  const halfV = viewport.fovRadians / 2
  const halfH = Math.atan(Math.tan(viewport.fovRadians / 2) * viewport.aspect)
  return Math.min(halfV, halfH)
}

describe('cameraPresetPose top-down view', () => {
  it('targets the center of the bounds', () => {
    const pose: CameraPose = cameraPresetPose('top', houseBounds, VIEWPORT)
    expect(pose.target).toEqual(CENTER)
  })

  it('places the camera directly above the center looking straight down', () => {
    const pose = cameraPresetPose('top', houseBounds, VIEWPORT)
    expect(Math.abs(pose.position.x - CENTER.x)).toBeLessThan(POSITION_TOLERANCE)
    expect(Math.abs(pose.position.z - CENTER.z)).toBeLessThan(POSITION_TOLERANCE)
    expect(pose.position.y).toBeGreaterThan(CENTER.y)
  })

  it('sets the up vector to world -Z so plan-north sits at the top of the pane', () => {
    const pose = cameraPresetPose('top', houseBounds, VIEWPORT)
    expect(pose.up).toEqual({ x: 0, y: 0, z: -1 })
  })

  it('derives near and far from the bounds diagonal, matching the framed view', () => {
    const pose = cameraPresetPose('top', houseBounds, VIEWPORT)
    const framed = frameSceneCamera(houseBounds)
    expect(pose.near).toBe(framed.near)
    expect(pose.far).toBe(framed.far)
  })

  it('fits the bounding sphere to the viewport without leaving it tiny', () => {
    const pose = cameraPresetPose('top', houseBounds, VIEWPORT)
    const distance = pose.position.y - CENTER.y
    const radius = diagonalOf(houseBounds) / 2
    const angularRadius = Math.asin(radius / distance)
    const halfAngle = limitingHalfAngle(VIEWPORT)
    expect(angularRadius).toBeLessThanOrEqual(halfAngle)
    expect(angularRadius).toBeGreaterThanOrEqual(halfAngle * FILL_FRACTION)
  })

  it('returns the fixed default pose for an empty scene (null bounds)', () => {
    expect(cameraPresetPose('top', null)).toEqual(DEFAULT_CAMERA_POSE)
  })

  it('returns the fixed default pose for degenerate (zero-size) bounds', () => {
    const degenerate: Bounds3 = { min: { x: 1, y: 1, z: 1 }, max: { x: 1, y: 1, z: 1 } }
    expect(cameraPresetPose('top', degenerate)).toEqual(DEFAULT_CAMERA_POSE)
  })
})

describe('cameraPresetPose elevations', () => {
  const elevations = [
    { preset: 'north' as const, axis: 'z' as const, sign: -1 },
    { preset: 'south' as const, axis: 'z' as const, sign: 1 },
    { preset: 'east' as const, axis: 'x' as const, sign: 1 },
    { preset: 'west' as const, axis: 'x' as const, sign: -1 },
  ]

  for (const { preset, axis, sign } of elevations) {
    describe(`the ${preset} elevation`, () => {
      it('targets the center of the bounds', () => {
        const pose: CameraPose = cameraPresetPose(preset, houseBounds, VIEWPORT)
        expect(pose.target).toEqual(CENTER)
      })

      it('keeps the up vector pointing toward world +Y', () => {
        const pose = cameraPresetPose(preset, houseBounds, VIEWPORT)
        expect(pose.up).toEqual({ x: 0, y: 1, z: 0 })
      })

      it('places the camera on the named facade side at the center height', () => {
        const pose = cameraPresetPose(preset, houseBounds, VIEWPORT)
        if (sign < 0) {
          expect(pose.position[axis]).toBeLessThan(CENTER[axis])
        } else {
          expect(pose.position[axis]).toBeGreaterThan(CENTER[axis])
        }
        const inPlane = axis === 'x' ? 'z' : 'x'
        expect(Math.abs(pose.position[inPlane] - CENTER[inPlane])).toBeLessThan(POSITION_TOLERANCE)
        expect(Math.abs(pose.position.y - CENTER.y)).toBeLessThan(POSITION_TOLERANCE)
      })

      it('derives near and far from the bounds diagonal, matching the framed view', () => {
        const pose = cameraPresetPose(preset, houseBounds, VIEWPORT)
        const framed = frameSceneCamera(houseBounds)
        expect(pose.near).toBe(framed.near)
        expect(pose.far).toBe(framed.far)
      })

      it('fits the bounding sphere to the viewport without leaving it tiny', () => {
        const pose = cameraPresetPose(preset, houseBounds, VIEWPORT)
        const distance = Math.hypot(
          pose.position.x - CENTER.x,
          pose.position.y - CENTER.y,
          pose.position.z - CENTER.z,
        )
        const radius = diagonalOf(houseBounds) / 2
        const angularRadius = Math.asin(radius / distance)
        const halfAngle = limitingHalfAngle(VIEWPORT)
        expect(angularRadius).toBeLessThanOrEqual(halfAngle)
        expect(angularRadius).toBeGreaterThanOrEqual(halfAngle * FILL_FRACTION)
      })
    })
  }
})
