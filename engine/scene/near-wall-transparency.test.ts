import * as THREE from 'three'
import { describe, it, expect } from 'vitest'
import { buildScene } from './build-scene'
import {
  cameraFacesWallOutside,
  prepareNearWallTransparency,
  updateNearWallTransparency,
} from './near-wall-transparency'
import { findByEntityId } from '../testing'
import { NeutralMaterialProvider } from '../materials/neutral-material-provider'
import { exteriorWalls, type SceneGraph } from '../../core'

const ROOM_SIDE_MM = 4000
const WALL_THICKNESS_MM = 200
const WALL_HEIGHT_MM = 2400

const FADED_OPACITY = 0.1
const OPAQUE = 1

/** The four corners of the square room's clear polygon, counter-clockwise. */
const roomSquare = [
  { x: 0, y: 0 },
  { x: ROOM_SIDE_MM, y: 0 },
  { x: ROOM_SIDE_MM, y: ROOM_SIDE_MM },
  { x: 0, y: ROOM_SIDE_MM },
]

/** One 200-thick wall along an edge of the square room, on the ground floor. */
const wall = (
  id: string,
  start: { x: number; y: number },
  end: { x: number; y: number },
): SceneGraph['walls'][number] => ({
  id,
  kind: 'wall',
  floorId: 'g',
  start,
  end,
  thickness: WALL_THICKNESS_MM,
  height: WALL_HEIGHT_MM,
})

/** A single rectangular room ringed by four exterior walls, all on one floor. */
const rectangularRoomGraph = (): SceneGraph => ({
  nodes: [{ id: 'floor:g', kind: 'floor', name: 'Ground', elevation: 0 }],
  walls: [
    wall('wall:bottom', { x: 0, y: 0 }, { x: ROOM_SIDE_MM, y: 0 }),
    wall('wall:right', { x: ROOM_SIDE_MM, y: 0 }, { x: ROOM_SIDE_MM, y: ROOM_SIDE_MM }),
    wall('wall:top', { x: ROOM_SIDE_MM, y: ROOM_SIDE_MM }, { x: 0, y: ROOM_SIDE_MM }),
    wall('wall:left', { x: 0, y: ROOM_SIDE_MM }, { x: 0, y: 0 }),
  ],
  rooms: [
    {
      id: 'room:r1',
      kind: 'room',
      floorId: 'g',
      polygon: roomSquare,
      clearPolygon: roomSquare,
      area: ROOM_SIDE_MM * ROOM_SIDE_MM,
      ceilingHeight: WALL_HEIGHT_MM,
    },
  ],
  underlays: [],
  openings: [],
  dimensions: [],
  stairs: [],
})

/** The material array of the wall mesh carrying `entityId` under `root`. */
const wallMaterials = (root: THREE.Group, entityId: string): THREE.Material[] => {
  const mesh = findByEntityId(root, entityId)
  expect(mesh).toBeInstanceOf(THREE.Mesh)
  return (mesh as THREE.Mesh).material as THREE.Material[]
}

const door = (): SceneGraph['openings'][number] => ({
  id: 'opening:door',
  kind: 'opening',
  floorId: 'g',
  type: 'single-swing-door',
  center: { x: 2000, y: 0 },
  along: { x: 1, y: 0 },
  normal: { x: 0, y: 1 },
  width: 900,
  height: 2032,
  sillHeight: 0,
  hostThickness: WALL_THICKNESS_MM,
  orientation: { hinge: 'start', facing: 'positive' },
  hostWallId: 'bottom',
})

/** The single-material mesh under the opening group whose material has `name`. */
const openingMesh = (root: THREE.Group, entityId: string, name: string): THREE.Mesh => {
  const group = findByEntityId(root, entityId)
  expect(group).not.toBeNull()
  let found: THREE.Mesh | undefined
  ;(group as THREE.Object3D).traverse((object) => {
    if (
      object instanceof THREE.Mesh &&
      !Array.isArray(object.material) &&
      object.material.name === name
    ) {
      found = object
    }
  })
  expect(found).toBeDefined()
  return found as THREE.Mesh
}

describe('cameraFacesWallOutside', () => {
  it('is true on the outward-normal side of the wall point and false on the other', () => {
    const point = { x: 0, z: 0 }
    const outwardNormal = { x: 0, z: -1 }

    expect(cameraFacesWallOutside({ x: 0, z: -100 }, point, outwardNormal)).toBe(true)
    expect(cameraFacesWallOutside({ x: 0, z: 100 }, point, outwardNormal)).toBe(false)
  })
})

describe('prepareNearWallTransparency', () => {
  it('clones each exterior wall mesh material array into private instances', () => {
    const graph = rectangularRoomGraph()
    const materials = new NeutralMaterialProvider()
    const sharedInteriorFace = materials.material('interiorFace')

    const root = buildScene(graph, materials)
    prepareNearWallTransparency(root, exteriorWalls(graph.walls, graph.rooms))

    const bottomMaterials = wallMaterials(root, 'wall:bottom')
    const topMaterials = wallMaterials(root, 'wall:top')

    // Cloned, not the provider's shared role instance.
    for (const material of bottomMaterials) {
      expect(material).not.toBe(sharedInteriorFace)
    }
    // Each wall owns its own instances: no material is shared between two walls.
    for (const bottom of bottomMaterials) {
      expect(topMaterials).not.toContain(bottom)
    }
  })
})

describe('updateNearWallTransparency', () => {
  it('fades the wall whose outside faces the camera and leaves the opposite wall opaque', () => {
    const graph = rectangularRoomGraph()
    const root = buildScene(graph, new NeutralMaterialProvider())
    const targets = prepareNearWallTransparency(root, exteriorWalls(graph.walls, graph.rooms))

    // Camera well to the negative-Z side: outside the bottom wall (world z=0,
    // outward normal world (0,0,-1)), inside the top wall (world z=4000,
    // outward normal world (0,0,+1)).
    updateNearWallTransparency(targets, { x: 2000, z: -3000 })

    for (const material of wallMaterials(root, 'wall:bottom')) {
      expect(material.transparent).toBe(true)
      expect(material.opacity).toBe(FADED_OPACITY)
      expect(material.depthWrite).toBe(false)
    }
    for (const material of wallMaterials(root, 'wall:top')) {
      expect(material.opacity).toBe(OPAQUE)
    }
  })

  it('fades a hosted opening with its wall and keeps the opening mesh material single', () => {
    const graph = rectangularRoomGraph()
    graph.openings = [door()]
    const root = buildScene(graph, new NeutralMaterialProvider())
    const targets = prepareNearWallTransparency(
      root,
      exteriorWalls(graph.walls, graph.rooms, graph.openings),
    )

    // Camera outside the bottom wall (world z=0, outward normal world (0,0,-1)).
    updateNearWallTransparency(targets, { x: 2000, z: -3000 })

    const leaf = openingMesh(root, 'opening:door', 'leaf')
    expect(Array.isArray(leaf.material)).toBe(false)
    expect((leaf.material as THREE.Material).opacity).toBe(FADED_OPACITY)
  })
})
