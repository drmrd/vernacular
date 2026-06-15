import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { NeutralMaterialProvider } from './neutral-material-provider'
import type { SurfaceRole } from './material-provider'

const NAMED_ROLES: SurfaceRole[] = [
  'interiorFace',
  'exteriorFace',
  'reveal',
  'top',
  'base',
  'junction',
]

describe('NeutralMaterialProvider', () => {
  it('names each surface role material after its role', () => {
    const provider = new NeutralMaterialProvider()

    for (const role of NAMED_ROLES) {
      const material = provider.material(role)
      expect(material).toBeInstanceOf(THREE.Material)
      expect(material.name).toBe(role)
    }
  })

  it('returns the same material instance for repeated lookups of a role', () => {
    const provider = new NeutralMaterialProvider()

    expect(provider.material('interiorFace')).toBe(provider.material('interiorFace'))
  })

  it('renders glass semi-transparent and the door leaf opaque, both double-sided', () => {
    const provider = new NeutralMaterialProvider()

    const glass = provider.material('glass') as THREE.MeshStandardMaterial
    expect(glass.name).toBe('glass')
    expect(glass.transparent).toBe(true)
    expect(glass.opacity).toBeLessThan(1)
    expect(glass.depthWrite).toBe(false)
    expect(glass.side).toBe(THREE.DoubleSide)

    const leaf = provider.material('leaf') as THREE.MeshStandardMaterial
    expect(leaf.name).toBe('leaf')
    expect(leaf.transparent).toBe(false)
    expect(leaf.side).toBe(THREE.DoubleSide)
  })
})
