import { describe, it, expect } from 'vitest'
import * as THREE from 'three'

import { buildScene } from '../../engine'
import { createSelectionStore } from '../selection/selection-store'
import { createSurfaceSelectionStore } from '../selection/surface-selection-store'
import { commitSelectionAt } from './scene-selection'
import type { RoomSceneNode, SceneGraph } from '../../core'

const SQUARE = [
  { x: 0, y: 0 },
  { x: 2000, y: 0 },
  { x: 2000, y: 2000 },
  { x: 0, y: 2000 },
]

const room: RoomSceneNode = {
  id: 'room:r1',
  kind: 'room',
  floorId: 'g',
  polygon: SQUARE,
  clearPolygon: SQUARE,
  area: 2000 * 2000,
}

const graph: SceneGraph = {
  nodes: [{ id: 'floor:g', kind: 'floor', name: 'G', elevation: 0 }],
  walls: [],
  rooms: [room],
  underlays: [],
  openings: [],
  dimensions: [],
  stairs: [],
  furniture: [],
}

const CANVAS_SIZE = 200
const CANVAS_CENTER = CANVAS_SIZE / 2

// A canvas stub whose bounding rect maps a click at its centre to the NDC origin.
function stubCanvas(): HTMLCanvasElement {
  return {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: CANVAS_SIZE, height: CANVAS_SIZE }),
  } as unknown as HTMLCanvasElement
}

// A plain pointer event at the canvas centre with no modifier keys held.
function centreClick(): PointerEvent {
  return {
    clientX: CANVAS_CENTER,
    clientY: CANVAS_CENTER,
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
  } as unknown as PointerEvent
}

// A camera above the room centre looking straight down at the floor slab top.
function topDownCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(50, 1, 1, 100000)
  camera.position.set(1000, 5000, 1000)
  camera.lookAt(1000, 0, 1000)
  camera.updateMatrixWorld(true)
  return camera
}

describe('commitSelectionAt', () => {
  it("targets a room's floor surface when the click picks its slab in 3D", () => {
    const root = buildScene(graph)
    root.updateMatrixWorld(true)
    const surfaceSelection = createSurfaceSelectionStore()

    commitSelectionAt(centreClick(), {
      domElement: stubCanvas(),
      camera: topDownCamera(),
      raycaster: new THREE.Raycaster(),
      root,
      selection: createSelectionStore(),
      surfaceSelection,
    })

    expect(surfaceSelection.getActiveSurface()).toEqual({ kind: 'floor', floorId: 'g' })
  })
})
