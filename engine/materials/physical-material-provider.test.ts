import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { PhysicalMaterialProvider } from './physical-material-provider'

const LIGHT_COLOR = { r: 1, g: 0.8, b: 0.6 }

describe('PhysicalMaterialProvider', () => {
  it('keeps an unpainted surface on the neutral standard material', () => {
    const provider = new PhysicalMaterialProvider({ lightColor: LIGHT_COLOR })

    const material = provider.material('interiorFace')

    expect(material).toBeInstanceOf(THREE.MeshStandardMaterial)
    expect(material).not.toBeInstanceOf(THREE.MeshPhysicalMaterial)
    expect(material.name).toBe('interiorFace')
  })
})
