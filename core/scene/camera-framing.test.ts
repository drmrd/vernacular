import { describe, it, expect } from 'vitest'
import type { Bounds3 } from './vector3'
import { frameSceneCamera, DEFAULT_CAMERA_POSE } from './camera-framing'

const houseBounds: Bounds3 = {
  min: { x: 0, y: 0, z: 0 },
  max: { x: 10000, y: 2700, z: 8000 },
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
