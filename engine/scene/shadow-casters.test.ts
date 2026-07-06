import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import type { OpeningFillRole } from '../../core'
import { isGlassPane, markShadowCasters } from './shadow-casters'
import { OPENING_FILL_ROLE_KEY } from './opening-fill-builder'

const GLASS_ROLE: OpeningFillRole = 'glass'
const LEAF_ROLE: OpeningFillRole = 'leaf'

function testMesh(): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial())
}

describe('markShadowCasters', () => {
  it('flags every non-glass mesh in the tree as a shadow caster and receiver', () => {
    const root = new THREE.Group()
    const mesh = testMesh()
    const nested = new THREE.Group()
    const deepMesh = testMesh()
    const leafMesh = testMesh()
    leafMesh.userData[OPENING_FILL_ROLE_KEY] = LEAF_ROLE
    nested.add(deepMesh)
    root.add(mesh, nested, leafMesh)

    markShadowCasters(root)

    expect(mesh.castShadow).toBe(true)
    expect(mesh.receiveShadow).toBe(true)
    expect(deepMesh.castShadow).toBe(true)
    expect(deepMesh.receiveShadow).toBe(true)
    expect(leafMesh.castShadow).toBe(true)
    expect(leafMesh.receiveShadow).toBe(true)
  })

  it('keeps a glass-stamped mesh from casting a shadow while it still receives one', () => {
    const root = new THREE.Group()
    const glassMesh = testMesh()
    glassMesh.userData[OPENING_FILL_ROLE_KEY] = GLASS_ROLE
    root.add(glassMesh)

    markShadowCasters(root)

    expect(glassMesh.castShadow).toBe(false)
    expect(glassMesh.receiveShadow).toBe(true)
  })
})

describe('isGlassPane', () => {
  it('identifies exactly a mesh stamped with the glass opening-fill role', () => {
    const glassMesh = testMesh()
    glassMesh.userData[OPENING_FILL_ROLE_KEY] = GLASS_ROLE

    const leafMesh = testMesh()
    leafMesh.userData[OPENING_FILL_ROLE_KEY] = LEAF_ROLE

    const unstampedMesh = testMesh()

    const glassStampedGroup = new THREE.Group()
    glassStampedGroup.userData[OPENING_FILL_ROLE_KEY] = GLASS_ROLE

    expect(isGlassPane(glassMesh)).toBe(true)
    expect(isGlassPane(leafMesh)).toBe(false)
    expect(isGlassPane(unstampedMesh)).toBe(false)
    expect(isGlassPane(glassStampedGroup)).toBe(false)
  })
})
