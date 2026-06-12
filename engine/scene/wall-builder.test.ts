import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildWallMesh } from './wall-builder'
import { NeutralMaterialProvider } from '../materials/neutral-material-provider'
import { materialGroups, readIndex, readNormals, readPositions } from '../testing'
import type { Vector3, WallSceneNode } from '../../core'

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

  it('winds its faces so role normals tie to the foundation orientation rule', () => {
    // Horizontal wall: the builder's world-Y rotation is zero, so the geometry's
    // local normals equal world normals and reading the normal attribute is valid.
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
    const materials = mesh.material as THREE.Material[]

    const groups = materialGroups(geometry)
    const index = readIndex(geometry)
    const normals = readNormals(geometry)

    const precision = 5
    const roleNormal = (role: string): Vector3 | undefined => {
      const group = groups.find((g) => materials[g.materialIndex]?.name === role)
      if (group === undefined) return undefined
      const vertexIndex = index[group.start]
      return vertexIndex === undefined ? undefined : normals[vertexIndex]
    }

    const top = roleNormal('top')
    expect(top).toBeDefined()
    expect(top?.x).toBeCloseTo(0, precision)
    expect(top?.y).toBeCloseTo(1, precision)
    expect(top?.z).toBeCloseTo(0, precision)

    const base = roleNormal('base')
    expect(base).toBeDefined()
    expect(base?.x).toBeCloseTo(0, precision)
    expect(base?.y).toBeCloseTo(-1, precision)
    expect(base?.z).toBeCloseTo(0, precision)

    const interior = roleNormal('interiorFace')
    expect(interior).toBeDefined()
    const interiorNormal = interior ?? { x: 0, y: 0, z: 0 }
    // The long face carries a horizontal normal: y is flat, and it points along x or z.
    expect(interiorNormal.y).toBeCloseTo(0, precision)
    expect(Math.hypot(interiorNormal.x, interiorNormal.z)).toBeCloseTo(1, precision)

    // The two long faces are oppositely wound: some face normal is the exact opposite.
    const opposite = { x: -interiorNormal.x, y: -interiorNormal.y, z: -interiorNormal.z }
    const matches = (a: Vector3, b: Vector3): boolean =>
      Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-5
    expect(normals.some((n) => matches(n, opposite))).toBe(true)
  })
})
