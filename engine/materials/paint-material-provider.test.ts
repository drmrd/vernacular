import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { colorFromHex, solidTreatment, surfaceKey } from '../../core'
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

  it('leaves the junction role neutral when no paint is configured', () => {
    const provider = new PaintMaterialProvider({ lightColor: LIGHT_COLOR })

    const material = provider.material('junction')

    expect(material).toBeInstanceOf(THREE.MeshStandardMaterial)
    expect(material.name).toBe('junction')
  })

  it('renders glass transparent without writing depth when no paint is configured', () => {
    const provider = new PaintMaterialProvider({ lightColor: LIGHT_COLOR })

    const glass = provider.material('glass') as THREE.MeshStandardMaterial

    expect(glass.transparent).toBe(true)
    expect(glass.depthWrite).toBe(false)
  })

  it('carries the light color it was constructed with', () => {
    const provider = new PaintMaterialProvider({ lightColor: LIGHT_COLOR })
    expect(provider.lightColor).toEqual(LIGHT_COLOR)
  })

  const FLOOR_REF = { kind: 'floor', floorId: 'demo' } as const
  const PAINT_HEX = '#3366cc'
  const paintStore = {
    [surfaceKey(FLOOR_REF)]: solidTreatment(colorFromHex(PAINT_HEX), 'matte'),
  }

  it('paints a surface whose ref is in the paint store', () => {
    const provider = new PaintMaterialProvider({ lightColor: LIGHT_COLOR, paint: paintStore })

    const material = provider.material('top', FLOOR_REF) as THREE.MeshStandardMaterial

    expect(material.color.equals(new THREE.Color(PAINT_HEX))).toBe(true)
  })

  it('keeps the neutral albedo for a surface with no ref', () => {
    const provider = new PaintMaterialProvider({ lightColor: LIGHT_COLOR, paint: paintStore })

    const material = provider.material('top') as THREE.MeshStandardMaterial

    expect(material.color.equals(new THREE.Color(PAINT_HEX))).toBe(false)
  })

  it('keeps the neutral albedo for a ref that is not painted', () => {
    const provider = new PaintMaterialProvider({ lightColor: LIGHT_COLOR, paint: paintStore })

    const material = provider.material('top', {
      kind: 'ceiling',
      floorId: 'demo',
    }) as THREE.MeshStandardMaterial

    expect(material.color.equals(new THREE.Color(PAINT_HEX))).toBe(false)
  })
})
