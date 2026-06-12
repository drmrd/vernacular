import { describe, expect, it } from 'vitest'
import { solidTreatment, surfaceKey, type SurfaceRef } from './paint'
import { colorFromHex } from '../color/color'

const leftFace: SurfaceRef = { kind: 'wall-face', wallId: 'wall-1', side: 'left' }
const rightFace: SurfaceRef = { kind: 'wall-face', wallId: 'wall-1', side: 'right' }
const floor: SurfaceRef = { kind: 'floor', floorId: 'floor-1' }
const ceiling: SurfaceRef = { kind: 'ceiling', floorId: 'floor-1' }

describe('surfaceKey', () => {
  it('is stable for structurally equal refs', () => {
    expect(surfaceKey({ kind: 'floor', floorId: 'floor-1' })).toBe(surfaceKey(floor))
  })

  it('distinguishes the two faces of one wall', () => {
    expect(surfaceKey(leftFace)).not.toBe(surfaceKey(rightFace))
  })

  it('distinguishes a floor from a ceiling on the same floor', () => {
    expect(surfaceKey(floor)).not.toBe(surfaceKey(ceiling))
  })

  it('keys an unsubdivided wall face without a region segment', () => {
    expect(surfaceKey(leftFace)).toBe('wall-face:wall-1:left')
  })

  it('appends the region to the key of a subdivided wall face', () => {
    const fieldRegion: SurfaceRef = {
      kind: 'wall-face',
      wallId: 'wall-1',
      side: 'left',
      region: 'field',
    }
    expect(surfaceKey(fieldRegion)).toBe('wall-face:wall-1:left:field')
  })

  it('distinguishes sub-areas of one wall face by region', () => {
    const wainscot: SurfaceRef = {
      kind: 'wall-face',
      wallId: 'wall-1',
      side: 'left',
      region: 'wainscot',
    }
    const field: SurfaceRef = {
      kind: 'wall-face',
      wallId: 'wall-1',
      side: 'left',
      region: 'field',
    }
    expect(surfaceKey(wainscot)).not.toBe(surfaceKey(field))
    expect(surfaceKey(wainscot)).not.toBe(surfaceKey(leftFace))
    expect(surfaceKey(field)).not.toBe(surfaceKey(leftFace))
  })
})

describe('solidTreatment', () => {
  it('builds a solid surface treatment from a color and finish', () => {
    const color = colorFromHex('#9aa583')
    expect(solidTreatment(color, 'matte')).toEqual({
      kind: 'solid',
      color: colorFromHex('#9aa583'),
      finishId: 'matte',
    })
  })
})
