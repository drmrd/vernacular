import { describe, expect, it } from 'vitest'
import { surfaceKey, type SurfaceRef } from './paint'

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
})
