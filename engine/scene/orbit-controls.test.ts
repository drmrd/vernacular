import * as THREE from 'three'
import { afterEach, describe, it, expect } from 'vitest'
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
const MOUSE_POINTER_ID = 1
const FRAMED_PIVOT = { x: 2000, y: 1200, z: -1500 }
const DRAG_START = { x: 400, y: 300 }
const DRAG_END = { x: 460, y: 330 }
const GIVEN_PIVOT = { x: 100, y: 200, z: -300 }
const CHANGED_COORDINATE = 999

// Controllers and panes are released after each test, also when an assertion throws.
const releases: Array<() => void> = []

afterEach(() => {
  releases.splice(0).forEach((release) => release())
})

const controllerOn = (
  camera: THREE.PerspectiveCamera,
  domElement: HTMLElement,
): ReturnType<typeof createOrbitController> => {
  const controller = createOrbitController(camera, domElement)
  releases.push(() => controller.dispose())
  return controller
}

// jsdom has no layout and no pointer capture, and the pan divides by the pane height.
const measuredPane = (): HTMLElement => {
  const pane = document.createElement('div')
  Object.defineProperty(pane, 'clientHeight', { value: PANE_HEIGHT_PIXELS })
  Object.defineProperty(pane, 'clientWidth', { value: PANE_WIDTH_PIXELS })
  pane.setPointerCapture = () => {}
  pane.releasePointerCapture = () => {}
  pane.hasPointerCapture = () => false
  document.body.appendChild(pane)
  releases.push(() => pane.remove())
  return pane
}

const cameraAbovePlan = (): THREE.PerspectiveCamera => {
  const camera = new THREE.PerspectiveCamera(
    CAMERA_FIELD_OF_VIEW_DEGREES,
    CAMERA_ASPECT_RATIO,
    CAMERA_NEAR_PLANE,
    PAN_CAMERA_FAR_PLANE,
  )
  camera.position.set(PAN_CAMERA_POSITION.x, PAN_CAMERA_POSITION.y, PAN_CAMERA_POSITION.z)
  return camera
}

// jsdom's MouseEvent plus the two pointer fields that the controls read.
const secondaryButtonPointer = (type: string, at: { x: number; y: number }): MouseEvent => {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: SECONDARY_BUTTON,
    clientX: at.x,
    clientY: at.y,
  })
  Object.defineProperty(event, 'pointerId', { value: MOUSE_POINTER_ID })
  Object.defineProperty(event, 'pointerType', { value: 'mouse' })
  return event
}

// The press lands on the pane; the move and the release land on the document, where the controls listen.
const dragSecondaryButton = (
  pane: HTMLElement,
  from: { x: number; y: number },
  to: { x: number; y: number },
): void => {
  pane.dispatchEvent(secondaryButtonPointer('pointerdown', from))
  document.dispatchEvent(secondaryButtonPointer('pointermove', to))
  document.dispatchEvent(secondaryButtonPointer('pointerup', to))
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
    const controller = controllerOn(cameraAtOrigin(), document.createElement('div'))

    controller.setTarget(GIVEN_PIVOT)

    expect(controller.getTarget()).toStrictEqual(GIVEN_PIVOT)
  })

  it('hands out the pivot a secondary-button drag panned to', () => {
    const camera = cameraAbovePlan()
    const pane = measuredPane()
    const controller = controllerOn(camera, pane)
    controller.setTarget(FRAMED_PIVOT)
    const before = camera.position.clone()

    dragSecondaryButton(pane, DRAG_START, DRAG_END)

    const moved = camera.position.clone().sub(before)
    expect(moved.length()).toBeGreaterThan(MINIMUM_CAMERA_TRAVEL)
    const panned = controller.getTarget()
    expect(panned.x).toBeCloseTo(FRAMED_PIVOT.x + moved.x, PAN_PRECISION_DIGITS)
    expect(panned.y).toBeCloseTo(FRAMED_PIVOT.y + moved.y, PAN_PRECISION_DIGITS)
    expect(panned.z).toBeCloseTo(FRAMED_PIVOT.z + moved.z, PAN_PRECISION_DIGITS)
  })

  it('hands out a copy, so changing it does not move the pivot', () => {
    const controller = controllerOn(cameraAtOrigin(), document.createElement('div'))
    controller.setTarget(GIVEN_PIVOT)

    const copy = controller.getTarget()
    copy.x = CHANGED_COORDINATE

    expect(controller.getTarget()).toStrictEqual(GIVEN_PIVOT)
  })
})
