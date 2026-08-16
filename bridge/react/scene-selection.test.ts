import { describe, it, expect } from 'vitest'
import * as THREE from 'three'

import { buildScene } from '../../engine'
import { createPerceivedColorStore } from '../perceived-color/perceived-color-store'
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

// A pointer event at the canvas's top-left corner. The top-down camera's field of
// view at this height spans well past the room's edges, so the ray this maps to
// sails past the floor slab and strikes nothing.
function cornerMissClick(): PointerEvent {
  return {
    clientX: 0,
    clientY: 0,
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
  } as unknown as PointerEvent
}

// A camera above the room centre looking straight down at the floor slab top.
// The room centre sits at world z = -1000 (plan y maps to world -z).
function topDownCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(50, 1, 1, 100000)
  camera.position.set(1000, 5000, -1000)
  camera.lookAt(1000, 0, -1000)
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

  it('requests a perceived-color sample at the same picked point when the click lands on a surface', () => {
    const root = buildScene(graph)
    root.updateMatrixWorld(true)
    const surfaceSelection = createSurfaceSelectionStore()
    const selection = createSelectionStore()
    const perceivedColor = createPerceivedColorStore()

    commitSelectionAt(centreClick(), {
      domElement: stubCanvas(),
      camera: topDownCamera(),
      raycaster: new THREE.Raycaster(),
      root,
      selection,
      surfaceSelection,
      perceivedColor,
    })

    // Same surface and same NDC as the pick that resolved it: the sample is
    // taken at the point the user clicked, not at the frame centre.
    expect(perceivedColor.getRequest()).toEqual({
      surface: { kind: 'floor', floorId: 'g' },
      ndc: { x: 0, y: 0 },
    })
    // The addition does not change the existing selection outcome.
    expect(surfaceSelection.getActiveSurface()).toEqual({ kind: 'floor', floorId: 'g' })
    expect(selection.getSelectedIds()).toEqual(new Set(['room:r1']))
  })

  it('does not request a perceived-color sample when the click resolves no surface', () => {
    const root = buildScene(graph)
    root.updateMatrixWorld(true)
    const perceivedColor = createPerceivedColorStore()

    commitSelectionAt(cornerMissClick(), {
      domElement: stubCanvas(),
      camera: topDownCamera(),
      raycaster: new THREE.Raycaster(),
      root,
      selection: createSelectionStore(),
      surfaceSelection: createSurfaceSelectionStore(),
      perceivedColor,
    })

    expect(perceivedColor.getRequest()).toBeNull()
  })

  // The readout is an optional enhancement: a caller with no perceived-color store
  // (walk mode, tests, or any host that has not wired one up) must still get the
  // existing selection behavior with no dependency on the readout feature at all.
  it('still selects the surface without throwing when perceivedColor is omitted from deps', () => {
    const root = buildScene(graph)
    root.updateMatrixWorld(true)
    const surfaceSelection = createSurfaceSelectionStore()

    expect(() =>
      commitSelectionAt(centreClick(), {
        domElement: stubCanvas(),
        camera: topDownCamera(),
        raycaster: new THREE.Raycaster(),
        root,
        selection: createSelectionStore(),
        surfaceSelection,
      }),
    ).not.toThrow()

    expect(surfaceSelection.getActiveSurface()).toEqual({ kind: 'floor', floorId: 'g' })
  })

  it('still selects the surface without throwing when perceivedColor is explicitly null', () => {
    const root = buildScene(graph)
    root.updateMatrixWorld(true)
    const surfaceSelection = createSurfaceSelectionStore()

    expect(() =>
      commitSelectionAt(centreClick(), {
        domElement: stubCanvas(),
        camera: topDownCamera(),
        raycaster: new THREE.Raycaster(),
        root,
        selection: createSelectionStore(),
        surfaceSelection,
        perceivedColor: null,
      }),
    ).not.toThrow()

    expect(surfaceSelection.getActiveSurface()).toEqual({ kind: 'floor', floorId: 'g' })
  })
})
