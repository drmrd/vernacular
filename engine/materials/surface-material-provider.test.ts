import { describe, it, expect } from 'vitest'
import { colorFromHex, solidTreatment, surfaceKey } from '../../core'
import { isCacheHeld } from '../scene/dispose-object'
import { PhysicalMaterialProvider } from './physical-material-provider'

const LIGHT_COLOR = { r: 1, g: 0.8, b: 0.6 }
const WALL_REF = { kind: 'wall-face', wallId: 'w1', side: 'left' } as const
const PAINT_HEX = '#3366cc'

function countDisposals(material: { addEventListener(type: 'dispose', cb: () => void): void }) {
  const counter = { count: 0 }
  material.addEventListener('dispose', () => {
    counter.count += 1
  })
  return counter
}

describe('SurfaceMaterialProvider ownership', () => {
  it('holds each material it returns and frees each cached one exactly once on dispose', () => {
    const paint = { [surfaceKey(WALL_REF)]: solidTreatment(colorFromHex(PAINT_HEX), 'matte') }
    const provider = new PhysicalMaterialProvider({ lightColor: LIGHT_COLOR, paint })
    const neutral = provider.material('interiorFace')
    const painted = provider.material('interiorFace', WALL_REF)
    const neutralDisposals = countDisposals(neutral)
    const paintedDisposals = countDisposals(painted)

    expect(isCacheHeld(neutral)).toBe(true)
    expect(isCacheHeld(painted)).toBe(true)

    provider.dispose()
    provider.dispose()

    expect(neutralDisposals.count).toBe(1)
    expect(paintedDisposals.count).toBe(1)
  })
})
