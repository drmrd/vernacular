import * as THREE from 'three'
import { describe, it, expect } from 'vitest'

import { NeutralMaterialProvider } from '../materials/neutral-material-provider'
import { createFloor, createFurnitureInstance, deriveFurnitureNode } from '../../core'
import type { OpeningSceneNode, RoomSceneNode, SceneNode, WallSceneNode } from '../../core'

import {
  assembleFloorRoot,
  buildFurnitureSubgroup,
  buildOpeningSubgroup,
  buildRoomSubgroup,
  buildWallSubgroup,
} from './floor-subgroups'

const ROOM_WIDTH = 4000
const ROOM_DEPTH = 3000
const ORIGIN = 0

const WALL_THICKNESS = 200
const WALL_HEIGHT = 2400

const FLOOR_ELEVATION = 2700

const RECTANGLE = [
  { x: ORIGIN, y: ORIGIN },
  { x: ROOM_WIDTH, y: ORIGIN },
  { x: ROOM_WIDTH, y: ROOM_DEPTH },
  { x: ORIGIN, y: ROOM_DEPTH },
]

/** A simple rectangular room node, mirroring the room-builder fixture style. */
const rectangularRoom = (): RoomSceneNode => ({
  id: 'room:r1',
  kind: 'room',
  floorId: 'g',
  polygon: RECTANGLE,
  clearPolygon: RECTANGLE,
  area: ROOM_WIDTH * ROOM_DEPTH,
})

/** A door-leaf opening node, mirroring the near-wall-transparency door fixture. */
const doorOpening = (): OpeningSceneNode => ({
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
  hostThickness: WALL_THICKNESS,
  orientation: { hinge: 'start', facing: 'positive' },
  hostWallId: 'bottom',
})

const ROOM_SIDE = 4000

const closedRoomWall = (
  id: string,
  start: { x: number; y: number },
  end: { x: number; y: number },
): WallSceneNode => ({
  id,
  kind: 'wall',
  floorId: 'g',
  start,
  end,
  thickness: WALL_THICKNESS,
  height: WALL_HEIGHT,
})

/** Four exterior walls ringing one square room, mirroring the near-wall fixture. */
const closedRoomWalls = (): WallSceneNode[] => [
  closedRoomWall('wall:bottom', { x: 0, y: 0 }, { x: ROOM_SIDE, y: 0 }),
  closedRoomWall('wall:right', { x: ROOM_SIDE, y: 0 }, { x: ROOM_SIDE, y: ROOM_SIDE }),
  closedRoomWall('wall:top', { x: ROOM_SIDE, y: ROOM_SIDE }, { x: 0, y: ROOM_SIDE }),
  closedRoomWall('wall:left', { x: 0, y: ROOM_SIDE }, { x: 0, y: 0 }),
]

const meshesOf = (group: THREE.Object3D): THREE.Mesh[] => {
  const meshes: THREE.Mesh[] = []
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) meshes.push(object)
  })
  return meshes
}

const edgeLinesOf = (group: THREE.Object3D): THREE.LineSegments[] => {
  const lines: THREE.LineSegments[] = []
  group.traverse((object) => {
    if (object instanceof THREE.LineSegments) lines.push(object)
  })
  return lines
}

/** A furniture node fixture mirroring the furniture-builder placement style. */
const placedFurniture = () =>
  deriveFurnitureNode(
    createFloor('Ground'),
    createFurnitureInstance({
      assetRef: { scope: 'user', contentHash: 'abc' },
      position: { x: 1000, y: 1000 },
      footprint: { width: 1200, depth: 600 },
      height: 750,
    }),
  )

describe('buildRoomSubgroup', () => {
  it('returns a self-decorated room group with mesh geometry, no edge overlay by default, and shadow-casting meshes', () => {
    const group = buildRoomSubgroup(rectangularRoom(), new NeutralMaterialProvider())

    expect(group).toBeInstanceOf(THREE.Group)

    const meshes = meshesOf(group)
    expect(meshes.length).toBeGreaterThan(0)
    expect(meshes.every((mesh) => mesh.geometry instanceof THREE.BufferGeometry)).toBe(true)

    expect(edgeLinesOf(group)).toHaveLength(0)

    expect(meshes.every((mesh) => mesh.castShadow === true)).toBe(true)
  })
})

describe('buildOpeningSubgroup', () => {
  it('returns a self-decorated door-leaf group with mesh geometry, no edge overlay by default, and shadow-casting meshes', () => {
    const group = buildOpeningSubgroup(doorOpening(), new NeutralMaterialProvider())

    expect(group).toBeInstanceOf(THREE.Group)

    const meshes = meshesOf(group)
    expect(meshes.length).toBeGreaterThan(0)
    expect(meshes.every((mesh) => mesh.geometry instanceof THREE.BufferGeometry)).toBe(true)

    expect(edgeLinesOf(group)).toHaveLength(0)

    expect(meshes.every((mesh) => mesh.castShadow === true)).toBe(true)
  })
})

describe('buildFurnitureSubgroup', () => {
  it('returns a self-decorated furniture group with a box mesh, no edge overlay by default, and shadow-casting meshes', () => {
    const group = buildFurnitureSubgroup(placedFurniture(), new NeutralMaterialProvider())

    expect(group).toBeInstanceOf(THREE.Group)

    const meshes = meshesOf(group)
    expect(meshes.length).toBeGreaterThan(0)
    expect(meshes.every((mesh) => mesh.geometry instanceof THREE.BufferGeometry)).toBe(true)

    expect(edgeLinesOf(group)).toHaveLength(0)

    expect(meshes.some((mesh) => mesh.castShadow === true)).toBe(true)
  })
})

describe('buildWallSubgroup', () => {
  it('returns a self-decorated wall group for a closed room', () => {
    const walls = closedRoomWalls()
    const openings: OpeningSceneNode[] = []

    const group = buildWallSubgroup({
      walls,
      openings,
      materials: new NeutralMaterialProvider(),
    })

    expect(group).toBeInstanceOf(THREE.Group)

    const meshes = meshesOf(group)
    expect(meshes.length).toBeGreaterThan(0)
    expect(meshes.every((mesh) => mesh.geometry instanceof THREE.BufferGeometry)).toBe(true)

    expect(edgeLinesOf(group)).toHaveLength(0)

    expect(meshes.every((mesh) => mesh.castShadow === true)).toBe(true)
  })
})

describe('floor sub-group edge overlay toggle', () => {
  const materials = () => new NeutralMaterialProvider()

  it('adds an edge overlay to a room group when the overlay is toggled on', () => {
    const group = buildRoomSubgroup(rectangularRoom(), materials(), { edgeOverlay: true })

    expect(edgeLinesOf(group).length).toBeGreaterThan(0)
  })

  it('adds an edge overlay to a door-leaf group when the overlay is toggled on', () => {
    const group = buildOpeningSubgroup(doorOpening(), materials(), { edgeOverlay: true })

    expect(edgeLinesOf(group).length).toBeGreaterThan(0)
  })

  it('adds an edge overlay to a furniture group when the overlay is toggled on', () => {
    const group = buildFurnitureSubgroup(placedFurniture(), materials(), { edgeOverlay: true })

    expect(edgeLinesOf(group).length).toBeGreaterThan(0)
  })

  it('adds an edge overlay to a wall group when the overlay is toggled on', () => {
    const group = buildWallSubgroup({
      walls: closedRoomWalls(),
      openings: [],
      materials: materials(),
      edgeOverlay: true,
    })

    expect(edgeLinesOf(group).length).toBeGreaterThan(0)
  })
})

describe('assembleFloorRoot', () => {
  it('wraps the sub-groups in a floor group positioned at the floor elevation and carrying its entity id', () => {
    const floorNode: SceneNode = {
      id: 'floor:g',
      kind: 'floor',
      name: 'Ground',
      elevation: FLOOR_ELEVATION,
    }
    const first = new THREE.Group()
    const second = new THREE.Group()

    const root = assembleFloorRoot(floorNode, [first, second])

    expect(root).toBeInstanceOf(THREE.Group)
    expect(root.children).toHaveLength(1)

    const floorGroup = root.children[0]
    expect(floorGroup).toBeDefined()
    if (floorGroup === undefined) return

    expect(floorGroup.position.y).toBe(FLOOR_ELEVATION)
    expect(floorGroup.userData.entityId).toBe('floor:g')
    expect(floorGroup.children).toContain(first)
    expect(floorGroup.children).toContain(second)
  })
})
