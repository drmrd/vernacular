import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { builtinFinishes, colorFromHex, solidTreatment, surfaceKey } from '../../core'
import { PhysicalMaterialProvider } from './physical-material-provider'

const LIGHT_COLOR = { r: 1, g: 0.8, b: 0.6 }
const WALL_REF = { kind: 'wall-face', wallId: 'w1', side: 'left' } as const
const PAINT_HEX = '#3366cc'
const finishCases = Object.values(builtinFinishes.entries).map(
  (finish) => [finish.id, finish] as const,
)

describe('PhysicalMaterialProvider', () => {
  it('keeps an unpainted surface on the neutral standard material', () => {
    const provider = new PhysicalMaterialProvider({ lightColor: LIGHT_COLOR })

    const material = provider.material('interiorFace')

    expect(material).toBeInstanceOf(THREE.MeshStandardMaterial)
    expect(material).not.toBeInstanceOf(THREE.MeshPhysicalMaterial)
    expect(material.name).toBe('interiorFace')
  })

  it.each(finishCases)(
    'renders a solid %s paint as a physical material carrying its finish',
    (finishId, finish) => {
      const paint = { [surfaceKey(WALL_REF)]: solidTreatment(colorFromHex(PAINT_HEX), finishId) }
      const provider = new PhysicalMaterialProvider({ lightColor: LIGHT_COLOR, paint })

      const material = provider.material('interiorFace', WALL_REF)

      expect(material).toBeInstanceOf(THREE.MeshPhysicalMaterial)
      const physical = material as THREE.MeshPhysicalMaterial
      expect(physical.roughness).toBe(finish.roughness)
      expect(physical.sheen).toBe(finish.sheen)
      expect(physical.specularIntensity).toBe(finish.specular)
      expect(physical.color.equals(new THREE.Color(PAINT_HEX))).toBe(true)
    },
  )
})
