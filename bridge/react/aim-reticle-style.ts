import type { CSSProperties } from 'react'

export const AIM_RETICLE = {
  dotColor: '#ffffff',
  keylineColor: '#1a1a1a',
  dotDiameterPx: 6,
  keylineWidthPx: 1,
} as const

export function aimReticleStyle(): CSSProperties {
  return {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: AIM_RETICLE.dotDiameterPx,
    height: AIM_RETICLE.dotDiameterPx,
    transform: 'translate(-50%, -50%)',
    borderRadius: '50%',
    backgroundColor: AIM_RETICLE.dotColor,
    boxShadow: `0 0 0 ${AIM_RETICLE.keylineWidthPx}px ${AIM_RETICLE.keylineColor}`,
    pointerEvents: 'none',
  }
}
