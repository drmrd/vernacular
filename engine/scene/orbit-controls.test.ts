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

const PANE_HEIGHT_PIXELS = 600
const PANE_WIDTH_PIXELS = 800
const PAN_CAMERA_FAR_PLANE = 100000
const PAN_CAMERA_POSITION = { x: 0, y: 3000, z: 8000 }
const PAN_PRECISION_DIGITS = 6
const MINIMUM_CAMERA_TRAVEL = 1
const SECONDARY_BUTTON = 2

// jsdom has no layout and no pointer capture, and the pan divides by the pane height.
const measuredPane = (): HTMLElement => {
  const pane = document.createElement('div')
  Object.defineProperty(pane, 'clientHeight', { value: PANE_HEIGHT_PIXELS })
  Object.defineProperty(pane, 'clientWidth', { value: PANE_WIDTH_PIXELS })
  pane.setPointerCapture = () => {}
  pane.releasePointerCapture = () => {}
  pane.hasPointerCapture = () => false
  document.body.appendChild(pane)
  return pane
}

// jsdom's MouseEvent plus the two pointer fields that the controls read.
const secondaryButtonPointer = (type: string, at: { x: number; y: number }): MouseEvent => {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: SECONDARY_BUTTON,
    clientX: at.x,
    clientY: at.y,
  })
  Object.defineProperty(event, 'pointerId', { value: 1 })
  Object.defineProperty(event, 'pointerType', { value: 'mouse' })
  return event
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

  it('hands out the pivot it was given as a plain value', () => {
    const controller = createOrbitController(cameraAtOrigin(), document.createElement('div'))

    controller.setTarget({ x: 100, y: 200, z: -300 })

    expect(controller.getTarget()).toStrictEqual({ x: 100, y: 200, z: -300 })

    controller.dispose()
  })

  it('hands out the pivot a secondary-button drag panned to', () => {
    const camera = new THREE.PerspectiveCamera(
      CAMERA_FIELD_OF_VIEW_DEGREES,
      CAMERA_ASPECT_RATIO,
      CAMERA_NEAR_PLANE,
      PAN_CAMERA_FAR_PLANE,
    )
    camera.position.set(PAN_CAMERA_POSITION.x, PAN_CAMERA_POSITION.y, PAN_CAMERA_POSITION.z)
    const pane = measuredPane()
    const controller = createOrbitController(camera, pane)
    const framed = { x: 2000, y: 1200, z: -1500 }
    controller.setTarget(framed)
    const before = camera.position.clone()

    pane.dispatchEvent(secondaryButtonPointer('pointerdown', { x: 400, y: 300 }))
    document.dispatchEvent(secondaryButtonPointer('pointermove', { x: 460, y: 330 }))
    document.dispatchEvent(secondaryButtonPointer('pointerup', { x: 460, y: 330 }))

    const moved = camera.position.clone().sub(before)
    expect(moved.length()).toBeGreaterThan(MINIMUM_CAMERA_TRAVEL)
    const panned = controller.getTarget()
    expect(panned.x).toBeCloseTo(framed.x + moved.x, PAN_PRECISION_DIGITS)
    expect(panned.y).toBeCloseTo(framed.y + moved.y, PAN_PRECISION_DIGITS)
    expect(panned.z).toBeCloseTo(framed.z + moved.z, PAN_PRECISION_DIGITS)

    controller.dispose()
    pane.remove()
  })

  it('hands out a copy, so changing it does not move the pivot', () => {
    const controller = createOrbitController(cameraAtOrigin(), document.createElement('div'))
    controller.setTarget({ x: 100, y: 200, z: -300 })

    const copy = controller.getTarget()
    copy.x = 999

    expect(controller.getTarget()).toStrictEqual({ x: 100, y: 200, z: -300 })

    controller.dispose()
  })
})
