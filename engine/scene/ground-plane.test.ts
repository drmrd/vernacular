import * as THREE from 'three'
import { describe, it, expect } from 'vitest'

import type { RoomSceneNode, SceneGraph } from '../../core'
import { findByEntityId } from '../testing'

import { buildScene } from './build-scene'
import {
  addGroundPlane,
  isGroundPlane,
  GRADE_ELEVATION_MM,
  GROUND_PLANE_NAME,
} from './ground-plane'

const FOOTPRINT_WIDTH_MM = 4000
const FOOTPRINT_DEPTH_MM = 3000
const FOOTPRINT_HEIGHT_MM = 2400

const BASEMENT_ELEVATION_MM = -2400
const FOUNDATION_WALL_HEIGHT_MM = 2700

// Box3 of an object in world space, with the whole hierarchy's matrices refreshed
// first so a mesh nested under an elevated floor group reports its true world Y.
const worldBox = (root: THREE.Object3D, object: THREE.Object3D): THREE.Box3 => {
  root.updateMatrixWorld(true)
  return new THREE.Box3().setFromObject(object)
}

describe('addGroundPlane', () => {
  it('adds a horizontal grass-colored ground plane at grade covering the footprint', () => {
    const root = new THREE.Group()
    const building = new THREE.Mesh(
      new THREE.BoxGeometry(FOOTPRINT_WIDTH_MM, FOOTPRINT_HEIGHT_MM, FOOTPRINT_DEPTH_MM),
    )
    // Span x in [0, 4000], y in [0, 2400], z in [0, 3000].
    building.position.set(FOOTPRINT_WIDTH_MM / 2, FOOTPRINT_HEIGHT_MM / 2, FOOTPRINT_DEPTH_MM / 2)
    root.add(building)

    addGroundPlane(root)

    const ground = root.children.find(isGroundPlane)
    expect(ground).toBeDefined()
    if (!ground) return
    expect(ground.name).toBe(GROUND_PLANE_NAME)

    const box = worldBox(root, ground)
    // Flat at grade: the plane has no vertical extent and sits on the datum.
    expect(box.min.y).toBeCloseTo(GRADE_ELEVATION_MM)
    expect(box.max.y).toBeCloseTo(GRADE_ELEVATION_MM)
    // Covers the building footprint with a surrounding site margin.
    expect(box.min.x).toBeLessThan(0)
    expect(box.max.x).toBeGreaterThan(FOOTPRINT_WIDTH_MM)
    expect(box.min.z).toBeLessThan(0)
    expect(box.max.z).toBeGreaterThan(FOOTPRINT_DEPTH_MM)

    const material = (ground as THREE.Mesh).material as THREE.MeshStandardMaterial
    expect(material.color.g).toBeGreaterThan(material.color.r)
    expect(material.color.g).toBeGreaterThan(material.color.b)
  })
})

describe('buildScene ground plane', () => {
  it('seats the unified model on a ground plane with the basement foundation rising above grade', () => {
    const graph: SceneGraph = {
      nodes: [
        { id: 'floor:ground', kind: 'floor', name: 'Ground', elevation: 0 },
        { id: 'floor:basement', kind: 'floor', name: 'Basement', elevation: BASEMENT_ELEVATION_MM },
      ],
      walls: [
        {
          id: 'wall:above',
          kind: 'wall',
          floorId: 'ground',
          start: { x: 0, y: 0 },
          end: { x: FOOTPRINT_WIDTH_MM, y: 0 },
          thickness: 200,
          height: FOUNDATION_WALL_HEIGHT_MM,
        },
        {
          id: 'wall:foundation',
          kind: 'wall',
          floorId: 'basement',
          start: { x: 0, y: 0 },
          end: { x: FOOTPRINT_WIDTH_MM, y: 0 },
          thickness: 300,
          height: FOUNDATION_WALL_HEIGHT_MM,
        },
      ],
      rooms: [],
      underlays: [],
      openings: [],
      dimensions: [],
      stairs: [],
      furniture: [],
    }

    const root = buildScene(graph)

    const ground = root.children.find(isGroundPlane)
    expect(ground).toBeDefined()
    if (!ground) return
    expect(worldBox(root, ground).max.y).toBeCloseTo(GRADE_ELEVATION_MM)

    const foundation = findByEntityId(root, 'wall:foundation')
    expect(foundation).not.toBeNull()
    if (!foundation) return
    const foundationBox = worldBox(root, foundation)
    // The basement finished floor is below grade, but the foundation wall rises
    // through the ground surface, so its above-grade portion shows above the lawn.
    expect(foundationBox.min.y).toBeLessThan(GRADE_ELEVATION_MM)
    expect(foundationBox.max.y).toBeGreaterThan(GRADE_ELEVATION_MM)
  })
})

const SLAB_TOP_ROLE = 'top'

// A single rectangular room seated on the ground floor: the built tree then
// holds both a room slab (whose top cap material is named `top`) and the ground
// plane, the two coincident at-grade surfaces this bias resolves.
const roomOnGroundGraph = (): SceneGraph => {
  const rectangle = [
    { x: 0, y: 0 },
    { x: FOOTPRINT_WIDTH_MM, y: 0 },
    { x: FOOTPRINT_WIDTH_MM, y: FOOTPRINT_DEPTH_MM },
    { x: 0, y: FOOTPRINT_DEPTH_MM },
  ]
  const room: RoomSceneNode = {
    id: 'room:r1',
    kind: 'room',
    floorId: 'ground',
    polygon: rectangle,
    clearPolygon: rectangle,
    area: FOOTPRINT_WIDTH_MM * FOOTPRINT_DEPTH_MM,
  }
  return {
    nodes: [{ id: 'floor:ground', kind: 'floor', name: 'Ground', elevation: 0 }],
    walls: [],
    rooms: [room],
    underlays: [],
    openings: [],
    dimensions: [],
    stairs: [],
    furniture: [],
  }
}

// The floor slab is the only surface carrying an upward `top` cap; that cap's
// entry is the finished-floor material whose backward depth bias the ground
// plane must exceed.
const slabTopMaterial = (root: THREE.Object3D): THREE.MeshStandardMaterial | undefined => {
  let found: THREE.MeshStandardMaterial | undefined
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !Array.isArray(object.material)) return
    const materials = object.material as THREE.Material[]
    const top = materials.find((material) => material.name === SLAB_TOP_ROLE)
    if (top) found = top as THREE.MeshStandardMaterial
  })
  return found
}

describe('buildScene ground plane depth bias', () => {
  it('biases the ground plane farther back than the coincident floor slab top so the finished floor wins', () => {
    const root = buildScene(roomOnGroundGraph())

    const ground = root.children.find(isGroundPlane)
    expect(ground).toBeDefined()
    if (!ground) return
    const groundMaterial = (ground as THREE.Mesh).material as THREE.MeshStandardMaterial

    const slabTop = slabTopMaterial(root)
    expect(slabTop).toBeDefined()
    if (!slabTop) return

    // A larger positive polygon offset pushes the ground plane farther back in
    // depth than the slab top, so the lawn loses the contest and the finished
    // floor draws over it where the two coplanar surfaces overlap.
    expect(groundMaterial.polygonOffset).toBe(true)
    expect(groundMaterial.polygonOffsetFactor).toBeGreaterThan(slabTop.polygonOffsetFactor)
    expect(groundMaterial.polygonOffsetUnits).toBeGreaterThan(slabTop.polygonOffsetUnits)
  })
})
