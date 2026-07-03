import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { createFloor, createFurnitureInstance, deriveFurnitureNode } from '../../core'
import type { FurnitureInstance, FurnitureSceneNode } from '../../core'
import type { SurfaceRole } from '../materials/material-provider'
import { NeutralMaterialProvider } from '../materials/neutral-material-provider'
import {
  FURNITURE_BASE_DEPTH_BIAS,
  FURNITURE_COLOR,
  FURNITURE_FAILED_COLOR,
  FURNITURE_FAILED_OPACITY,
  FURNITURE_LOADING_COLOR,
  FURNITURE_LOADING_OPACITY,
  FURNITURE_OPACITY,
} from '../materials/role-appearance'

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
// Plan y maps to world -z, so the footprint's z span is the negated y span.
const EXPECTED_MIN_Z = -(POSITION.y + HALF_DEPTH)
const EXPECTED_MAX_Z = -(POSITION.y - HALF_DEPTH)
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

  it('flags the massing group as a placeholder box so a loaded model is distinguishable from it', () => {
    const group = buildFurnitureMassing(buildNode(buildInstance()), new NeutralMaterialProvider())

    expect(group.userData.furnitureMassing).toBe(true)
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

  it('carries the distinct red semi-transparent material on the unloaded box mesh', () => {
    const group = buildFurnitureMassing(buildNode(buildInstance()), new NeutralMaterialProvider())

    const materials = firstMeshMaterials(group)

    expect(materials.length).toBeGreaterThan(0)
    for (const material of materials) {
      const colored = material as THREE.Material & { color: THREE.Color }
      expect(colored.color.getHex()).toBe(FURNITURE_COLOR)
      expect(material.transparent).toBe(true)
      expect(material.opacity).toBe(FURNITURE_OPACITY)
    }
  })

  it('carries the furnitureFailed material on a failed-load box mesh', () => {
    const group = buildFurnitureMassing(
      buildNode(buildInstance()),
      new NeutralMaterialProvider(),
      'furnitureFailed',
    )

    const materials = firstMeshMaterials(group)

    expect(materials.length).toBeGreaterThan(0)
    for (const material of materials) {
      const colored = material as THREE.Material & { color: THREE.Color }
      expect(colored.color.getHex()).toBe(FURNITURE_FAILED_COLOR)
      expect(material.name).toBe('furnitureFailed')
      expect(material.transparent).toBe(true)
      expect(material.opacity).toBe(FURNITURE_FAILED_OPACITY)
    }
  })

  it('carries the furnitureLoading material on a loading box mesh', () => {
    const group = buildFurnitureMassing(
      buildNode(buildInstance()),
      new NeutralMaterialProvider(),
      'furnitureLoading' as SurfaceRole,
    )

    const materials = firstMeshMaterials(group)

    expect(materials.length).toBeGreaterThan(0)
    for (const material of materials) {
      const colored = material as THREE.Material & { color: THREE.Color }
      expect(colored.color.getHex()).toBe(FURNITURE_LOADING_COLOR)
      expect(material.name).toBe('furnitureLoading')
      expect(material.transparent).toBe(true)
      expect(material.opacity).toBe(FURNITURE_LOADING_OPACITY)
    }
  })

  it('biases only the base-cap section back in depth so the box loses the depth test to the floor it rests on', () => {
    const group = buildFurnitureMassing(buildNode(buildInstance()), new NeutralMaterialProvider())

    const materials = firstMeshMaterials(group)

    // The base cap is its own material section apart from the sides and top, so the
    // box is a multi-material mesh, the same one-material-per-section shape the wall
    // builders already use.
    expect(materials.length).toBeGreaterThan(1)

    // Exactly the base-cap section carries the furniture-base rung, pushed back far
    // enough to lose the depth test to the slab top and the ground plane beneath it.
    const biased = materials.filter(
      (material) =>
        material.polygonOffset === true &&
        material.polygonOffsetFactor === FURNITURE_BASE_DEPTH_BIAS.factor &&
        material.polygonOffsetUnits === FURNITURE_BASE_DEPTH_BIAS.units,
    )
    expect(biased).toHaveLength(1)

    // The sides and top stay unbiased at the furniture role's default, so only the
    // coincident base cap loses the contest.
    const unbiased = materials.filter((material) => material.polygonOffset !== true)
    expect(unbiased).toHaveLength(materials.length - 1)
  })
})
