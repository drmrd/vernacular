import { describe, it, expect } from 'vitest'
import type { Point } from '../model/types'
import { signedArea, canonicalOuterLoop, canonicalHoleLoop, loopWorldNormal } from './winding'

// A unit square in the plan frame, listed counter-clockwise in screen y-down.
const square: Point[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
]

describe('loop winding convention', () => {
  it('computes a signed area whose sign encodes orientation', () => {
    expect(signedArea(square)).toBeCloseTo(1, 10)
    expect(signedArea([...square].reverse())).toBeCloseTo(-1, 10)
  })

  it('orients a floor outer loop so its world normal points up (+Y) after planToWorld', () => {
    const outer = canonicalOuterLoop(square)
    const normal = loopWorldNormal(outer, 0)
    expect(normal.y).toBeGreaterThan(0)
    expect(Math.abs(normal.x)).toBeLessThan(1e-9)
    expect(Math.abs(normal.z)).toBeLessThan(1e-9)
  })

  it('winds a hole opposite to the canonical outer loop', () => {
    const outer = canonicalOuterLoop(square)
    const hole = canonicalHoleLoop(square)
    expect(Math.sign(signedArea(hole))).toBe(-Math.sign(signedArea(outer)))
  })

  it('is idempotent: re-canonicalizing an already-canonical loop is a no-op in orientation', () => {
    const outer = canonicalOuterLoop(square)
    expect(Math.sign(signedArea(canonicalOuterLoop(outer)))).toBe(Math.sign(signedArea(outer)))
  })
})
