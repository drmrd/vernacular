import * as THREE from 'three'
import { describe, it, expect } from 'vitest'

import type { SceneGraph } from '../../core'
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
