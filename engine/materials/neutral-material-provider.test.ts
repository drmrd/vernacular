import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { NeutralMaterialProvider } from './neutral-material-provider'
import type { SurfaceRole } from './material-provider'

const NAMED_ROLES: SurfaceRole[] = ['interiorFace', 'exteriorFace', 'reveal', 'top', 'base']

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
})
