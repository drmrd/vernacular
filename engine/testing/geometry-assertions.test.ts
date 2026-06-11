import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { readPositions, readNormals, materialGroups, findByEntityId, collectEntityIds } from '.'

describe('geometry assertion helpers', () => {
  it('reads vertex positions as flat triples from a BufferGeometry', () => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3),
    )
    expect(readPositions(geometry)).toEqual([
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
    ])
  })

  it('reads computed face normals', () => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 0, 1], 3),
    )
    geometry.computeVertexNormals()
    const normals = readNormals(geometry)
    expect(normals).toHaveLength(3)
    expect(normals[0]?.y).toBeCloseTo(-1, 5)
  })

  it('reports material groups by start, count, and material index', () => {
    const geometry = new THREE.BufferGeometry()
    geometry.addGroup(0, 3, 0)
    geometry.addGroup(3, 3, 1)
    expect(materialGroups(geometry)).toEqual([
      { start: 0, count: 3, materialIndex: 0 },
      { start: 3, count: 3, materialIndex: 1 },
    ])
  })

  it('finds an object by entityId and collects all entity ids in a built root', () => {
    const root = new THREE.Group()
    const child = new THREE.Group()
    child.userData.entityId = 'wall:1'
    root.add(child)
    expect(findByEntityId(root, 'wall:1')).toBe(child)
    expect(findByEntityId(root, 'missing')).toBeNull()
    expect(collectEntityIds(root)).toEqual(['wall:1'])
  })
})
