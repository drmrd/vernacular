import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { markShadowCasters } from './shadow-casters'

describe('markShadowCasters', () => {
  it('flags every mesh in the tree as a shadow caster and receiver', () => {
    const root = new THREE.Group()
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial())
    const nested = new THREE.Group()
    const deepMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial(),
    )
    nested.add(deepMesh)
    root.add(mesh, nested)

    markShadowCasters(root)

    expect(mesh.castShadow).toBe(true)
    expect(mesh.receiveShadow).toBe(true)
    expect(deepMesh.castShadow).toBe(true)
    expect(deepMesh.receiveShadow).toBe(true)
  })
})
