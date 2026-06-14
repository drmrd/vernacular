import { describe, it, expect } from 'vitest'
import type { Bounds3, Vector3 } from './vector3'
import { frameSceneCamera, DEFAULT_CAMERA_POSE } from './camera-framing'

const houseBounds: Bounds3 = {
  min: { x: 0, y: 0, z: 0 },
  max: { x: 10000, y: 2700, z: 8000 },
}

interface CameraPose {
  position: Vector3
  target: Vector3
  near: number
  far: number
}

interface Viewport {
  aspect: number
  fovRadians: number
  margin?: number
}

// The intended public signature gains an optional viewport argument. Until the
// implementation accepts it, project the existing export onto the target
// contract so the new behavior can be exercised.
const frameWithViewport = frameSceneCamera as unknown as (
  bounds: Bounds3 | null,
  viewport?: Viewport,
) => CameraPose

const FOV_RADIANS = (75 * Math.PI) / 180
const WIDE_ASPECT = 2.0
const NARROW_ASPECT = 0.4
const ANGLE_TOLERANCE = 1e-6
const FILL_FRACTION = 0.8

function angularRadiusOf(pose: CameraPose, bounds: Bounds3): number {
  const sizeX = bounds.max.x - bounds.min.x
  const sizeY = bounds.max.y - bounds.min.y
  const sizeZ = bounds.max.z - bounds.min.z
  const radius = Math.hypot(sizeX, sizeY, sizeZ) / 2
  const distance = distanceFromTarget(pose)
  return Math.asin(radius / distance)
}

function distanceFromTarget(pose: CameraPose): number {
  return Math.hypot(
    pose.position.x - pose.target.x,
    pose.position.y - pose.target.y,
    pose.position.z - pose.target.z,
  )
}

function halfHorizontalAngle(fovRadians: number, aspect: number): number {
  return Math.atan(Math.tan(fovRadians / 2) * aspect)
}

describe('frameSceneCamera', () => {
  it('targets the center of the bounds', () => {
    const pose = frameSceneCamera(houseBounds)
    expect(pose.target).toEqual({ x: 5000, y: 1350, z: 4000 })
  })

  it('derives near and far from the bounds diagonal so thin geometry does not z-fight', () => {
    const pose = frameSceneCamera(houseBounds)
    const diagonal = Math.hypot(10000, 2700, 8000)
    expect(pose.near).toBeGreaterThan(0)
    expect(pose.near).toBeLessThan(diagonal)
    expect(pose.far).toBeGreaterThan(diagonal)
    expect(pose.far / pose.near).toBeGreaterThan(100)
  })

  it('positions the camera away from the target so the bounds are in view', () => {
    const pose = frameSceneCamera(houseBounds)
    const dx = pose.position.x - pose.target.x
    const dy = pose.position.y - pose.target.y
    const dz = pose.position.z - pose.target.z
    expect(Math.hypot(dx, dy, dz)).toBeGreaterThan(Math.hypot(10000, 2700, 8000) / 2)
    expect(pose.position.y).toBeGreaterThan(pose.target.y)
  })

  it('returns the fixed default pose for an empty scene (null bounds), never NaN', () => {
    expect(frameSceneCamera(null)).toEqual(DEFAULT_CAMERA_POSE)
  })

  it('returns the fixed default pose for degenerate (zero-size) bounds', () => {
    const pose = frameSceneCamera({ min: { x: 1, y: 1, z: 1 }, max: { x: 1, y: 1, z: 1 } })
    expect(pose).toEqual(DEFAULT_CAMERA_POSE)
    expect(Number.isNaN(pose.near)).toBe(false)
  })
})

describe('frameSceneCamera with a viewport', () => {
  it('fits the bounding sphere inside both frustum half-angles for a wide aspect', () => {
    const pose = frameWithViewport(houseBounds, { aspect: WIDE_ASPECT, fovRadians: FOV_RADIANS })
    const angularRadius = angularRadiusOf(pose, houseBounds)
    const halfV = FOV_RADIANS / 2
    const halfH = halfHorizontalAngle(FOV_RADIANS, WIDE_ASPECT)
    expect(angularRadius).toBeLessThanOrEqual(halfV + ANGLE_TOLERANCE)
    expect(angularRadius).toBeLessThanOrEqual(halfH + ANGLE_TOLERANCE)
  })

  it('fits the bounding sphere inside both frustum half-angles for a narrow aspect', () => {
    const pose = frameWithViewport(houseBounds, { aspect: NARROW_ASPECT, fovRadians: FOV_RADIANS })
    const angularRadius = angularRadiusOf(pose, houseBounds)
    const halfV = FOV_RADIANS / 2
    const halfH = halfHorizontalAngle(FOV_RADIANS, NARROW_ASPECT)
    expect(angularRadius).toBeLessThanOrEqual(halfV + ANGLE_TOLERANCE)
    expect(angularRadius).toBeLessThanOrEqual(halfH + ANGLE_TOLERANCE)
  })

  it('fills most of the limiting half-angle so the model is not tiny', () => {
    const pose = frameWithViewport(houseBounds, { aspect: WIDE_ASPECT, fovRadians: FOV_RADIANS })
    const angularRadius = angularRadiusOf(pose, houseBounds)
    const halfV = FOV_RADIANS / 2
    const halfH = halfHorizontalAngle(FOV_RADIANS, WIDE_ASPECT)
    expect(angularRadius).toBeGreaterThanOrEqual(Math.min(halfV, halfH) * FILL_FRACTION)
  })

  it('pushes the camera farther back for a narrower aspect than for a wide one', () => {
    const widePose = frameWithViewport(houseBounds, {
      aspect: WIDE_ASPECT,
      fovRadians: FOV_RADIANS,
    })
    const narrowPose = frameWithViewport(houseBounds, {
      aspect: NARROW_ASPECT,
      fovRadians: FOV_RADIANS,
    })
    expect(distanceFromTarget(narrowPose)).toBeGreaterThan(distanceFromTarget(widePose))
  })

  it('still targets the center of the bounds when a viewport is supplied', () => {
    const pose = frameWithViewport(houseBounds, { aspect: WIDE_ASPECT, fovRadians: FOV_RADIANS })
    expect(pose.target).toEqual({ x: 5000, y: 1350, z: 4000 })
  })

  it('keeps valid near and far planes when a viewport is supplied', () => {
    const pose = frameWithViewport(houseBounds, { aspect: WIDE_ASPECT, fovRadians: FOV_RADIANS })
    expect(pose.near).toBeGreaterThan(0)
    expect(pose.far).toBeGreaterThan(pose.near)
  })
})
