import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  builtinFinishes,
  colorFromHex,
  getEntry,
  patternTreatment,
  solidTreatment,
  surfaceKey,
} from '../../core'
import { PhysicalMaterialProvider } from './physical-material-provider'

const LIGHT_COLOR = { r: 1, g: 0.8, b: 0.6 }
const WALL_REF = { kind: 'wall-face', wallId: 'w1', side: 'left' } as const
const FLOOR_REF = { kind: 'floor', floorId: 'f1' } as const
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

  it('caches one physical material per painted surface key', () => {
    const paint = { [surfaceKey(WALL_REF)]: solidTreatment(colorFromHex(PAINT_HEX), 'satin') }
    const provider = new PhysicalMaterialProvider({ lightColor: LIGHT_COLOR, paint })

    const first = provider.material('interiorFace', WALL_REF)
    const second = provider.material('interiorFace', WALL_REF)

    expect(first).toBe(second)
  })

  it('renders a solid paint whose finish is unregistered like the matte finish, not a glossy default', () => {
    const matte = getEntry(builtinFinishes, 'matte')
    const paint = {
      [surfaceKey(WALL_REF)]: solidTreatment(colorFromHex(PAINT_HEX), 'no-such-finish'),
    }
    const provider = new PhysicalMaterialProvider({ lightColor: LIGHT_COLOR, paint })

    const material = provider.material('interiorFace', WALL_REF)

    expect(material).toBeInstanceOf(THREE.MeshPhysicalMaterial)
    const physical = material as THREE.MeshPhysicalMaterial
    expect(physical.roughness).toBe(matte?.roughness)
    expect(physical.sheen).toBe(matte?.sheen)
    expect(physical.specularIntensity).toBe(matte?.specular)
  })

  it('keeps a pattern treatment on the standard material rather than the physical one', () => {
    const paint = {
      [surfaceKey(FLOOR_REF)]: patternTreatment('tile-grid', 300, [colorFromHex(PAINT_HEX)]),
    }
    const provider = new PhysicalMaterialProvider({ lightColor: LIGHT_COLOR, paint })

    const material = provider.material('top', FLOOR_REF)

    expect(material).toBeInstanceOf(THREE.MeshStandardMaterial)
    expect(material).not.toBeInstanceOf(THREE.MeshPhysicalMaterial)
  })
})

const SECOND_PAINT_HEX = '#cc6633'
const PINNED_SHEEN_ROUGHNESS = 1
const UNREGISTERED_FINISH_ID = 'no-such-finish'
const sheenBearingCases = finishCases.filter(([, finish]) => finish.sheen > 0)
const sheenlessCases = [
  ...finishCases.filter(([, finish]) => finish.sheen === 0),
  [UNREGISTERED_FINISH_ID, { sheen: 0 }] as const,
]

function physicalPaint(
  ref: typeof WALL_REF | typeof FLOOR_REF,
  hex: string,
  finishId: string,
): Record<string, ReturnType<typeof solidTreatment>> {
  return { [surfaceKey(ref)]: solidTreatment(colorFromHex(hex), finishId) }
}

describe('PhysicalMaterialProvider sheen', () => {
  it.each(sheenBearingCases)(
    'tints the sheen of a solid %s paint with its paint color',
    (finishId, finish) => {
      const paint = physicalPaint(WALL_REF, PAINT_HEX, finishId)
      const provider = new PhysicalMaterialProvider({ lightColor: LIGHT_COLOR, paint })

      const physical = provider.material('interiorFace', WALL_REF) as THREE.MeshPhysicalMaterial

      expect(physical.sheen).toBe(finish.sheen)
      expect(physical.sheenColor.equals(new THREE.Color(PAINT_HEX))).toBe(true)
      expect(physical.sheenColor.equals(physical.color)).toBe(true)
      expect(physical.sheenColor.getHex()).not.toBe(0x000000)
      expect(physical.sheenRoughness).toBe(PINNED_SHEEN_ROUGHNESS)
    },
  )

  it.each(sheenlessCases)('renders no sheen lobe for a solid %s paint', (finishId) => {
    const paint = physicalPaint(WALL_REF, PAINT_HEX, finishId)
    const provider = new PhysicalMaterialProvider({ lightColor: LIGHT_COLOR, paint })

    const physical = provider.material('interiorFace', WALL_REF) as THREE.MeshPhysicalMaterial

    const effectiveTint = physical.sheenColor.clone().multiplyScalar(physical.sheen)
    expect(physical.sheen).toBe(0)
    expect(effectiveTint.getHex()).toBe(0x000000)
  })

  it('gives each semi-gloss surface a sheen color from its own paint', () => {
    const paint = {
      ...physicalPaint(WALL_REF, PAINT_HEX, 'semi-gloss'),
      ...physicalPaint(FLOOR_REF, SECOND_PAINT_HEX, 'semi-gloss'),
    }
    const provider = new PhysicalMaterialProvider({ lightColor: LIGHT_COLOR, paint })

    const wall = provider.material('interiorFace', WALL_REF) as THREE.MeshPhysicalMaterial
    const floor = provider.material('top', FLOOR_REF) as THREE.MeshPhysicalMaterial

    expect(wall.sheenColor.equals(new THREE.Color(PAINT_HEX))).toBe(true)
    expect(floor.sheenColor.equals(new THREE.Color(SECOND_PAINT_HEX))).toBe(true)
    expect(wall.sheenColor.equals(floor.sheenColor)).toBe(false)
  })
})
