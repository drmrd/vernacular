import { describe, it, expect } from 'vitest'
import { PerspectiveCamera, Raycaster } from '../../engine/testing'

import { buildScene } from '../../engine'
import { colorFromHex, planToWorld } from '../../core'
import { createPerceivedColorStore } from '../perceived-color/perceived-color-store'
import { createSelectionStore } from '../selection/selection-store'
import { createSurfaceSelectionStore } from '../selection/surface-selection-store'
import { commitSelectionAt } from './scene-selection'
import type { Point, SceneGraph, SurfaceRef, WallSceneNode } from '../../core'

// A click on a wall in the 3D view. The wall runs along the plan x axis from start to
// end, so the left face (the side of the left-hand normal (-dy, dx)) is the one at
// plan +y, and the right face is the one at plan -y. Each click is the centre of the
// canvas, so the camera's aim point is exactly where the ray strikes.

const WALL_ID = 'w1'
const WALL_THICKNESS = 120
const WALL_HEIGHT = 2600
const WALL_LENGTH = 4000
const AIM_ALONG = 2000
const AIM_HEIGHT = 1300
const STANDOFF = 2000
const CAMERA_HEIGHT_ABOVE_CAP = 3000
const CANVAS_SIZE = 200
const CANVAS_CENTER = CANVAS_SIZE / 2

const wall: WallSceneNode = {
  id: `wall:${WALL_ID}`,
  kind: 'wall',
  floorId: 'g',
  start: { x: 0, y: 0 },
  end: { x: WALL_LENGTH, y: 0 },
  thickness: WALL_THICKNESS,
  height: WALL_HEIGHT,
}

const graph: SceneGraph = {
  nodes: [{ id: 'floor:g', kind: 'floor', name: 'G', elevation: 0 }],
  walls: [wall],
  rooms: [],
  underlays: [],
  openings: [],
  dimensions: [],
  stairs: [],
  furniture: [],
}

const faceRef = (side: 'left' | 'right'): SurfaceRef => ({
  kind: 'wall-face',
  wallId: WALL_ID,
  side,
})

function stubCanvas(): HTMLCanvasElement {
  return {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: CANVAS_SIZE, height: CANVAS_SIZE }),
  } as unknown as HTMLCanvasElement
}

function centreClick(): PointerEvent {
  return {
    clientX: CANVAS_CENTER,
    clientY: CANVAS_CENTER,
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
  } as unknown as PointerEvent
}

/** A plan point and the height above the floor it stands at. */
interface Spot {
  readonly plan: Point
  readonly height: number
}

function cameraLooking(from: Spot, at: Spot): PerspectiveCamera {
  const eye = planToWorld(from.plan, from.height)
  const target = planToWorld(at.plan, at.height)
  const camera = new PerspectiveCamera(50, 1, 1, 100000)
  camera.position.set(eye.x, eye.y, eye.z)
  camera.lookAt(target.x, target.y, target.z)
  camera.updateMatrixWorld(true)
  return camera
}

/** A camera standing off the wall's given side, aimed square at solid wall. */
const faceOnCamera = (side: 'left' | 'right'): PerspectiveCamera =>
  cameraLooking(
    { plan: { x: AIM_ALONG, y: side === 'left' ? STANDOFF : -STANDOFF }, height: AIM_HEIGHT },
    { plan: { x: AIM_ALONG, y: 0 }, height: AIM_HEIGHT },
  )

/** A camera straight above the wall's centre line, aimed down at its top cap. */
const overheadCamera = (): PerspectiveCamera =>
  cameraLooking(
    { plan: { x: AIM_ALONG, y: 0 }, height: WALL_HEIGHT + CAMERA_HEIGHT_ABOVE_CAP },
    { plan: { x: AIM_ALONG, y: 0 }, height: WALL_HEIGHT },
  )

interface ClickStores {
  readonly surfaceSelection: ReturnType<typeof createSurfaceSelectionStore>
  readonly perceivedColor: ReturnType<typeof createPerceivedColorStore>
}

function clickWith(camera: PerspectiveCamera, beforeClick?: (stores: ClickStores) => void) {
  const root = buildScene(graph)
  root.updateMatrixWorld(true)
  const selection = createSelectionStore()
  const surfaceSelection = createSurfaceSelectionStore()
  const perceivedColor = createPerceivedColorStore()
  beforeClick?.({ surfaceSelection, perceivedColor })
  commitSelectionAt(centreClick(), {
    domElement: stubCanvas(),
    camera,
    raycaster: new Raycaster(),
    root,
    selection,
    surfaceSelection,
    perceivedColor,
  })
  return { selection, surfaceSelection, perceivedColor }
}

describe('commitSelectionAt on a wall', () => {
  it.each(['left', 'right'] as const)(
    'makes the %s face the paint target and selects the wall when the click lands on that face',
    (side) => {
      const { selection, surfaceSelection } = clickWith(faceOnCamera(side))

      expect(surfaceSelection.getActiveSurface()).toEqual(faceRef(side))
      expect(selection.getSelectedIds()).toEqual(new Set([wall.id]))
    },
  )

  it.each(['left', 'right'] as const)(
    'requests the perceived-color sample for the same %s face the click made the paint target',
    (side) => {
      const { surfaceSelection, perceivedColor } = clickWith(faceOnCamera(side))

      expect(perceivedColor.getRequest()).toEqual({
        surface: surfaceSelection.getActiveSurface(),
        ndc: { x: 0, y: 0 },
      })
      expect(perceivedColor.getRequest()?.surface).toEqual(faceRef(side))
    },
  )

  // "No target" is a null active surface: the store holds one SurfaceRef or null.
  it('selects the wall but sets no paint target and no color sample when the click lands on its top cap', () => {
    const { selection, surfaceSelection, perceivedColor } = clickWith(overheadCamera())

    expect(selection.getSelectedIds()).toEqual(new Set([wall.id]))
    expect(surfaceSelection.getActiveSurface()).toBeNull()
    expect(perceivedColor.getRequest()).toBeNull()
  })
})

// A face click earlier left a paint target and a color sample on screen. A cap click gives no
// paint target, so it must not leave that sample up: the readout would name a face that is not
// under the pointer. The active face stays, as an empty-space click leaves it.
describe('commitSelectionAt on a wall cap after a click on a face', () => {
  const NDC = { x: 0.5, y: 0.5 }
  const sampleOnScreen = ({ surfaceSelection, perceivedColor }: ClickStores): void => {
    surfaceSelection.select(faceRef('left'))
    perceivedColor.resolveSample({ surface: faceRef('left'), color: colorFromHex('#a1b2c3') })
  }
  const requestPending = ({ surfaceSelection, perceivedColor }: ClickStores): void => {
    surfaceSelection.select(faceRef('left'))
    perceivedColor.requestSample(faceRef('left'), NDC)
  }

  it.each([
    ['a color sample on screen', sampleOnScreen],
    ['a sample request still pending', requestPending],
  ])('keeps the active face and drops %s', (_name, beforeClick) => {
    const { surfaceSelection, perceivedColor } = clickWith(overheadCamera(), beforeClick)

    expect(surfaceSelection.getActiveSurface()).toEqual(faceRef('left'))
    expect(perceivedColor.getRequest()).toBeNull()
    expect(perceivedColor.getSample()).toBeNull()
  })

  it('selects the wall without a perceived-color store mounted', () => {
    const root = buildScene(graph)
    root.updateMatrixWorld(true)
    const selection = createSelectionStore()

    commitSelectionAt(centreClick(), {
      domElement: stubCanvas(),
      camera: overheadCamera(),
      raycaster: new Raycaster(),
      root,
      selection,
      surfaceSelection: createSurfaceSelectionStore(),
    })

    expect(selection.getSelectedIds()).toEqual(new Set([wall.id]))
  })
})

// A click on a room floor making the floor the paint target is already pinned by
// scene-selection.test.ts, so it is not repeated here.
