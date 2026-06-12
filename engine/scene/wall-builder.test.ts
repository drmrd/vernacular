import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildWallMesh } from './wall-builder'
import { NeutralMaterialProvider } from '../materials/neutral-material-provider'
import { materialGroups, readIndex, readPositions } from '../testing'
import type { WallSceneNode } from '../../core'

describe('buildWallMesh', () => {
  it('extrudes a wall as a box centered on its centerline with its base on the floor datum', () => {
    const wallLength = 2000
    const thickness = 120
    const height = 2400
    const halfThickness = thickness / 2

    const node: WallSceneNode = {
      id: 'wall:w1',
      kind: 'wall',
      floorId: 'g',
      start: { x: 0, y: 0 },
      end: { x: wallLength, y: 0 },
      thickness,
      height,
    }

    const mesh = buildWallMesh(node, new NeutralMaterialProvider())

    expect(mesh).toBeInstanceOf(THREE.Mesh)
    expect(mesh.userData.entityId).toBe('wall:w1')

    const precision = 3
    const aabb = new THREE.Box3().setFromObject(mesh)
    expect(aabb.min.x).toBeCloseTo(0, precision)
    expect(aabb.max.x).toBeCloseTo(wallLength, precision)
    expect(aabb.min.y).toBeCloseTo(0, precision)
    expect(aabb.max.y).toBeCloseTo(height, precision)
    expect(aabb.min.z).toBeCloseTo(-halfThickness, precision)
    expect(aabb.max.z).toBeCloseTo(halfThickness, precision)
  })

  it('groups its faces into per-surface materials covering the four shell roles and every triangle', () => {
    const node: WallSceneNode = {
      id: 'wall:w1',
      kind: 'wall',
      floorId: 'g',
      start: { x: 0, y: 0 },
      end: { x: 2000, y: 0 },
      thickness: 120,
      height: 2400,
    }

    const mesh = buildWallMesh(node, new NeutralMaterialProvider())
    const geometry = mesh.geometry as THREE.BufferGeometry

    expect(Array.isArray(mesh.material)).toBe(true)
    const materials = mesh.material as THREE.Material[]

    const groups = materialGroups(geometry)
    const drawnRoles = new Set(groups.map((group) => materials[group.materialIndex]?.name))

    expect([...drawnRoles].sort()).toEqual(['base', 'exteriorFace', 'interiorFace', 'top'])
    expect(drawnRoles.has('reveal')).toBe(false)

    const index = readIndex(geometry)
    const totalTriangleVertices = index.length > 0 ? index.length : readPositions(geometry).length
    const coveredTriangleVertices = groups.reduce((sum, group) => sum + group.count, 0)
    expect(coveredTriangleVertices).toBe(totalTriangleVertices)
  })
})
