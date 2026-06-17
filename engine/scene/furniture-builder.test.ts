import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { createFloor, createFurnitureInstance, deriveFurnitureNode } from '../../core'
import type { FurnitureInstance, FurnitureSceneNode } from '../../core'
import { NeutralMaterialProvider } from '../materials/neutral-material-provider'

import { buildFurnitureMassing } from './furniture-builder'

const PRECISION = 3

const POSITION = { x: 1000, y: 2000 }
const FOOTPRINT = { width: 1200, depth: 600 }
const ELEVATION_Z = 0
const HEIGHT = 750

const HALF_WIDTH = FOOTPRINT.width / 2
const HALF_DEPTH = FOOTPRINT.depth / 2

const EXPECTED_MIN_X = POSITION.x - HALF_WIDTH
const EXPECTED_MAX_X = POSITION.x + HALF_WIDTH
const EXPECTED_MIN_Z = POSITION.y - HALF_DEPTH
const EXPECTED_MAX_Z = POSITION.y + HALF_DEPTH
const EXPECTED_MIN_Y = ELEVATION_Z
const EXPECTED_MAX_Y = ELEVATION_Z + HEIGHT

function buildInstance(): FurnitureInstance {
  return createFurnitureInstance({
    assetRef: { scope: 'user', contentHash: 'abc' },
    position: POSITION,
    footprint: FOOTPRINT,
    rotation: 0,
    elevationZ: ELEVATION_Z,
    height: HEIGHT,
  })
}

function buildNode(instance: FurnitureInstance): FurnitureSceneNode {
  return deriveFurnitureNode(createFloor('Ground'), instance)
}

function firstMeshMaterials(group: THREE.Group): THREE.Material[] {
  let mesh: THREE.Mesh | undefined
  group.traverse((object) => {
    if (mesh === undefined && object instanceof THREE.Mesh) {
      mesh = object
    }
  })
  const material = mesh?.material
  if (material === undefined) {
    return []
  }
  return Array.isArray(material) ? material : [material]
}

describe('buildFurnitureMassing', () => {
  it('tags the massing group with the raw furniture instance id', () => {
    const instance = buildInstance()

    const group = buildFurnitureMassing(buildNode(instance), new NeutralMaterialProvider())

    expect(group.userData.entityId).toBe(instance.id)
  })

  it('spans the footprint in X and Z and elevation-to-top in Y in world space', () => {
    const group = buildFurnitureMassing(buildNode(buildInstance()), new NeutralMaterialProvider())

    const aabb = new THREE.Box3().setFromObject(group)

    expect(aabb.min.x).toBeCloseTo(EXPECTED_MIN_X, PRECISION)
    expect(aabb.max.x).toBeCloseTo(EXPECTED_MAX_X, PRECISION)
    expect(aabb.min.z).toBeCloseTo(EXPECTED_MIN_Z, PRECISION)
    expect(aabb.max.z).toBeCloseTo(EXPECTED_MAX_Z, PRECISION)
    expect(aabb.min.y).toBeCloseTo(EXPECTED_MIN_Y, PRECISION)
    expect(aabb.max.y).toBeCloseTo(EXPECTED_MAX_Y, PRECISION)
  })

  it('names the box mesh material so painting can key on it', () => {
    const group = buildFurnitureMassing(buildNode(buildInstance()), new NeutralMaterialProvider())

    const materials = firstMeshMaterials(group)

    expect(materials.length).toBeGreaterThan(0)
    for (const material of materials) {
      expect(material.name).toBe('furniture')
    }
  })
})
