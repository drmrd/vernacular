import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { isGlassPane, markShadowCasters } from './shadow-casters'
import { OPENING_FILL_ROLE_KEY } from './opening-fill-builder'

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

describe('isGlassPane', () => {
  it('identifies exactly a mesh stamped with the glass opening-fill role', () => {
    const glassMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial(),
    )
    glassMesh.userData[OPENING_FILL_ROLE_KEY] = 'glass'

    const leafMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial(),
    )
    leafMesh.userData[OPENING_FILL_ROLE_KEY] = 'leaf'

    const unstampedMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial(),
    )

    const glassStampedGroup = new THREE.Group()
    glassStampedGroup.userData[OPENING_FILL_ROLE_KEY] = 'glass'

    expect(isGlassPane(glassMesh)).toBe(true)
    expect(isGlassPane(leafMesh)).toBe(false)
    expect(isGlassPane(unstampedMesh)).toBe(false)
    expect(isGlassPane(glassStampedGroup)).toBe(false)
  })
})
