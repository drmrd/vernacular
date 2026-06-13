import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { PaintMaterialProvider } from './paint-material-provider'

const LIGHT_COLOR = { r: 1, g: 0.8, b: 0.6 }

describe('PaintMaterialProvider', () => {
  it('returns a role-named material for each surface role', () => {
    const provider = new PaintMaterialProvider({ lightColor: LIGHT_COLOR })

    const material = provider.material('interiorFace')

    expect(material).toBeInstanceOf(THREE.MeshStandardMaterial)
    expect(material.name).toBe('interiorFace')
  })

  it('caches one material per role', () => {
    const provider = new PaintMaterialProvider({ lightColor: LIGHT_COLOR })
    expect(provider.material('top')).toBe(provider.material('top'))
  })

  it('carries the light color it was constructed with', () => {
    const provider = new PaintMaterialProvider({ lightColor: LIGHT_COLOR })
    expect(provider.lightColor).toEqual(LIGHT_COLOR)
  })
})
