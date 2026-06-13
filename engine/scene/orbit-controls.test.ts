import * as THREE from 'three'
import { describe, it, expect } from 'vitest'
import { createOrbitController } from './orbit-controls'

const CAMERA_FIELD_OF_VIEW_DEGREES = 50
const CAMERA_ASPECT_RATIO = 1
const CAMERA_NEAR_PLANE = 1
const CAMERA_FAR_PLANE = 10000
const CAMERA_START_DISTANCE = 100
const DIRECTION_PRECISION_DIGITS = 4

const cameraAtOrigin = (): THREE.PerspectiveCamera => {
  const camera = new THREE.PerspectiveCamera(
    CAMERA_FIELD_OF_VIEW_DEGREES,
    CAMERA_ASPECT_RATIO,
    CAMERA_NEAR_PLANE,
    CAMERA_FAR_PLANE,
  )
  camera.position.set(0, 0, CAMERA_START_DISTANCE)
  return camera
}

describe('createOrbitController', () => {
  it('aims the camera at the target after setTarget', () => {
    const camera = cameraAtOrigin()
    const domElement = document.createElement('div')
    const controller = createOrbitController(camera, domElement)

    controller.setTarget({ x: 100, y: 0, z: 0 })

    const worldDirection = camera.getWorldDirection(new THREE.Vector3())
    const expectedDirection = new THREE.Vector3(100, 0, -100).normalize()
    expect(worldDirection.x).toBeCloseTo(expectedDirection.x, DIRECTION_PRECISION_DIGITS)
    expect(worldDirection.y).toBeCloseTo(expectedDirection.y, DIRECTION_PRECISION_DIGITS)
    expect(worldDirection.z).toBeCloseTo(expectedDirection.z, DIRECTION_PRECISION_DIGITS)

    controller.dispose()
  })

  it('toggles enablement and disposes without throwing', () => {
    const camera = cameraAtOrigin()
    const domElement = document.createElement('div')
    const controller = createOrbitController(camera, domElement)

    expect(() => {
      controller.setEnabled(false)
      controller.setEnabled(true)
      controller.update()
      controller.dispose()
    }).not.toThrow()
  })
})
