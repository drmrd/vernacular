import * as THREE from 'three'
import { describe, it, expect } from 'vitest'
import { buildScene } from './build-scene'
import { prepareNearWallTransparency, updateNearWallTransparency } from './near-wall-transparency'
import { findByEntityId } from '../testing'
import { NeutralMaterialProvider } from '../materials/neutral-material-provider'
import { FURNITURE_OPACITY } from '../materials/role-appearance'
import { exteriorWalls, withAttachedFurniture, type SceneGraph } from '../../core'

const ROOM_SIDE_MM = 4000
const WALL_THICKNESS_MM = 200
const WALL_HEIGHT_MM = 2400

const FADED_OPACITY = 0.1

/** The four corners of the square room's clear polygon, counter-clockwise. */
const roomSquare = [
  { x: 0, y: 0 },
  { x: ROOM_SIDE_MM, y: 0 },
  { x: ROOM_SIDE_MM, y: ROOM_SIDE_MM },
  { x: 0, y: ROOM_SIDE_MM },
]

/** A single 200-thick wall on the ground floor, mirroring the sibling suite's `wall` helper. */
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
  furniture: [],
})

/**
 * A furniture node whose axis-aligned footprint spans the given plan extents. The
 * node id carries the `furniture:` prefix; the built massing group carries the RAW
 * instance id as its entityId (the furniture-builder convention).
 */
const furnitureNode = (
  id: string,
  min: { x: number; y: number },
  max: { x: number; y: number },
): SceneGraph['furniture'][number] => ({
  id,
  kind: 'furniture',
  floorId: 'g',
  footprintCorners: [
    { x: min.x, y: min.y },
    { x: max.x, y: min.y },
    { x: max.x, y: max.y },
    { x: min.x, y: max.y },
  ],
  elevationZ: 0,
  height: 1800,
  assetRef: { scope: 'user', contentHash: 'hash-of-a-test-piece' },
})

/** Every material of every mesh under the group carrying the raw furniture id. */
const furnitureMaterials = (root: THREE.Group, rawId: string): THREE.Material[] => {
  const group = findByEntityId(root, rawId)
  expect(group).not.toBeNull()
  const materials: THREE.Material[] = []
  ;(group as THREE.Object3D).traverse((object) => {
    if (object instanceof THREE.Mesh) {
      materials.push(...(Array.isArray(object.material) ? object.material : [object.material]))
    }
  })
  expect(materials.length).toBeGreaterThan(0)
  return materials
}

/** The material array of the wall mesh carrying `entityId` under `root`. */
const wallMaterials = (root: THREE.Group, entityId: string): THREE.Material[] => {
  const mesh = findByEntityId(root, entityId)
  expect(mesh).toBeInstanceOf(THREE.Mesh)
  return (mesh as THREE.Mesh).material as THREE.Material[]
}

describe('updateNearWallTransparency with wall-attached furniture', () => {
  it('fades furniture standing against an exterior wall together with that wall', () => {
    const graph = rectangularRoomGraph()
    // A wardrobe flush against the bottom wall's interior face (plan y = 100).
    graph.furniture = [
      furnitureNode('furniture:wardrobe', { x: 1700, y: 100 }, { x: 2300, y: 700 }),
    ]
    const root = buildScene(graph, new NeutralMaterialProvider())
    const targets = prepareNearWallTransparency(
      root,
      withAttachedFurniture(exteriorWalls(graph.walls, graph.rooms), graph.walls, graph.furniture),
    )

    // Camera outside the bottom wall (world z = 0, outward normal world (0,0,+1)):
    // the wall fades, and the wardrobe against it must recede with it.
    updateNearWallTransparency(targets, { x: 2000, z: 3000 })

    for (const material of furnitureMaterials(root, 'wardrobe')) {
      expect(material.opacity).toBe(FADED_OPACITY)
    }

    // From inside the room the wall returns, and the wardrobe must return to its
    // own translucent massing baseline, not to blanket-solid.
    updateNearWallTransparency(targets, { x: 2000, z: -3000 })

    for (const material of furnitureMaterials(root, 'wardrobe')) {
      expect(material.opacity).toBe(FURNITURE_OPACITY)
    }
  })

  it('leaves free-standing furniture at its own baseline while a distant wall fades', () => {
    const graph = rectangularRoomGraph()
    // A table in the middle of the room, standing against no wall.
    graph.furniture = [furnitureNode('furniture:table', { x: 1700, y: 1700 }, { x: 2300, y: 2300 })]
    const root = buildScene(graph, new NeutralMaterialProvider())
    const targets = prepareNearWallTransparency(
      root,
      withAttachedFurniture(exteriorWalls(graph.walls, graph.rooms), graph.walls, graph.furniture),
    )

    // The bottom wall fades, but the free-standing table must not fade with it.
    updateNearWallTransparency(targets, { x: 2000, z: 3000 })

    for (const material of wallMaterials(root, 'wall:bottom')) {
      expect(material.opacity).toBe(FADED_OPACITY)
    }
    // The table keeps its own translucent massing baseline: it never drops to the
    // faded opacity with a wall it does not stand against.
    for (const material of furnitureMaterials(root, 'table')) {
      expect(material.opacity).toBe(FURNITURE_OPACITY)
    }
  })
})
