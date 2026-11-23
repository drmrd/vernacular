import { describe, it, expect } from 'vitest'
import { contrastRatio } from '../../core'
import { AIM_RETICLE, aimReticleStyle } from './aim-reticle-style'

const MIN_CONTRAST = 3
const GRAY_LEVELS = 256

function grayGround(level: number): string {
  return `#${level.toString(16).padStart(2, '0').repeat(3)}`
}

describe('the aim dot style', () => {
  it('holds 3:1 against every gray ground with the dot or its keyline', () => {
    const { dotColor, keylineColor } = AIM_RETICLE
    for (let level = 0; level < GRAY_LEVELS; level += 1) {
      const ground = grayGround(level)
      const best = Math.max(contrastRatio(dotColor, ground), contrastRatio(keylineColor, ground))
      expect(best, `ground ${ground}`).toBeGreaterThanOrEqual(MIN_CONTRAST)
    }
  })

  it('sets the dot apart from its keyline', () => {
    const { dotColor, keylineColor } = AIM_RETICLE
    expect(contrastRatio(dotColor, keylineColor)).toBeGreaterThanOrEqual(MIN_CONTRAST)
  })

  it('is a small light dot with a thin dark keyline', () => {
    expect(AIM_RETICLE).toEqual({
      dotColor: '#ffffff',
      keylineColor: '#1a1a1a',
      dotDiameterPx: 6,
      keylineWidthPx: 1,
    })
  })

  it('centers a dot the pointer passes through', () => {
    expect(aimReticleStyle()).toEqual({
      position: 'absolute',
      left: '50%',
      top: '50%',
      width: 6,
      height: 6,
      transform: 'translate(-50%, -50%)',
      borderRadius: '50%',
      backgroundColor: '#ffffff',
      boxShadow: '0 0 0 1px #1a1a1a',
      pointerEvents: 'none',
    })
  })
})
