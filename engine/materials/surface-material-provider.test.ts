import { describe, it, expect } from 'vitest'
import { colorFromHex, solidTreatment, surfaceKey } from '../../core'
import { countFrees } from '../scene/dispose-count-test-support'
import { isCacheHeld } from '../scene/dispose-object'
import { PhysicalMaterialProvider } from './physical-material-provider'

const LIGHT_COLOR = { r: 1, g: 0.8, b: 0.6 }
const WALL_REF = { kind: 'wall-face', wallId: 'w1', side: 'left' } as const
const PAINT_HEX = '#3366cc'

describe('SurfaceMaterialProvider ownership', () => {
  it('holds each material it returns and frees each cached one exactly once on dispose', () => {
    const paint = { [surfaceKey(WALL_REF)]: solidTreatment(colorFromHex(PAINT_HEX), 'matte') }
    const provider = new PhysicalMaterialProvider({ lightColor: LIGHT_COLOR, paint })
    const neutral = provider.material('interiorFace')
    const painted = provider.material('interiorFace', WALL_REF)
    const counts = countFrees([neutral, painted])

    expect(isCacheHeld(neutral)).toBe(true)
    expect(isCacheHeld(painted)).toBe(true)

    provider.dispose()
    provider.dispose()

    expect(counts.get(neutral)).toBe(1)
    expect(counts.get(painted)).toBe(1)
  })
})
