import { describe, it, expect } from 'vitest'

import type { CameraPose, Vector3 } from '../../core'
import { cameraPositionOf, initialCamera, orbitPivot } from './scene-camera-seed'

const FRAMED_POSE: CameraPose = {
  position: { x: 1000, y: 2000, z: 3000 },
  target: { x: 0, y: 0, z: 0 },
  near: 50,
  far: 40000,
}

const PRESET_POSE: CameraPose = {
  position: { x: 5000, y: 5000, z: 5000 },
  target: { x: 10000, y: 20000, z: 30000 },
  near: 50,
  far: 40000,
}

const WHERE_THE_USER_LEFT_OFF: Vector3 = { x: 400, y: 500, z: 600 }

describe('initialCamera', () => {
  it('opens the canvas on the framed pose when the session saved no camera position', () => {
    expect(initialCamera(FRAMED_POSE, null)).toEqual({
      position: [FRAMED_POSE.position.x, FRAMED_POSE.position.y, FRAMED_POSE.position.z],
      near: FRAMED_POSE.near,
      far: FRAMED_POSE.far,
    })
  })

  it('opens the canvas where the user left the camera, still clipping by the framed pose', () => {
    expect(initialCamera(FRAMED_POSE, WHERE_THE_USER_LEFT_OFF)).toEqual({
      position: [WHERE_THE_USER_LEFT_OFF.x, WHERE_THE_USER_LEFT_OFF.y, WHERE_THE_USER_LEFT_OFF.z],
      near: FRAMED_POSE.near,
      far: FRAMED_POSE.far,
    })
  })
})

describe('orbitPivot', () => {
  it('pivots on the framed centre while the framing is active, even with a preset in the session', () => {
    const pivot = orbitPivot({
      userControlled: false,
      presetPose: PRESET_POSE,
      framedPose: FRAMED_POSE,
    })

    expect(pivot).toBe(FRAMED_POSE.target)
  })

  it('pivots on the applied preset while the user steers', () => {
    const pivot = orbitPivot({
      userControlled: true,
      presetPose: PRESET_POSE,
      framedPose: FRAMED_POSE,
    })

    expect(pivot).toBe(PRESET_POSE.target)
  })

  it("keeps the controller's own pivot while the user steers with no preset applied", () => {
    const pivot = orbitPivot({
      userControlled: true,
      presetPose: null,
      framedPose: FRAMED_POSE,
    })

    expect(pivot).toBeNull()
  })
})

describe('cameraPositionOf', () => {
  it('copies out the live camera position, so later camera motion cannot rewrite it', () => {
    const camera = { position: { x: 7, y: 8, z: 9 } }

    const noted = cameraPositionOf(camera)

    expect(noted).toEqual({ x: 7, y: 8, z: 9 })
    expect(noted).not.toBe(camera.position)
  })
})
