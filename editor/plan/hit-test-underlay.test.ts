import { describe, expect, it } from 'vitest'

import type { UnderlaySceneNode } from '../../core'

import { hitTestUnderlay } from './hit-test-underlay'

function underlay(overrides: Partial<UnderlaySceneNode> = {}): UnderlaySceneNode {
  return {
    id: 'underlay:u1',
    kind: 'underlay',
    floorId: 'f1',
    source: { kind: 'raster', image: { scope: 'project', contentHash: 'abc' } },
    width: 100,
    height: 50,
    placement: { offset: { x: 1000, y: 2000 }, millimetersPerPixel: 10, rotation: 0 },
    opacity: 1,
    visible: true,
    ...overrides,
  }
}

// The axis-aligned footprint spans x in [1000, 2000] and y in [1500, 2000].
const INSIDE = { x: 1500, y: 1750 }
const OUTSIDE = { x: 5000, y: 5000 }

describe('hitTestUnderlay', () => {
  it('returns the node id for a point inside the footprint', () => {
    expect(hitTestUnderlay([underlay()], INSIDE)).toBe('underlay:u1')
  })

  it('returns null for a point outside every footprint', () => {
    expect(hitTestUnderlay([underlay()], OUTSIDE)).toBeNull()
  })

  it('ignores hidden underlays', () => {
    expect(hitTestUnderlay([underlay({ visible: false })], INSIDE)).toBeNull()
  })

  it('returns the topmost underlay when footprints overlap', () => {
    const lower = underlay({ id: 'underlay:lower' })
    const upper = underlay({ id: 'underlay:upper' })

    expect(hitTestUnderlay([lower, upper], INSIDE)).toBe('underlay:upper')
  })

  it('hit-tests against the rotated footprint', () => {
    // A quarter-turn about the offset sweeps the footprint into x in [1000, 1500],
    // y in [2000, 3000]. The point sits inside that rotated quad but outside the
    // axis-aligned one, so only the rotation-aware test hits it.
    const rotated = underlay({
      placement: { offset: { x: 1000, y: 2000 }, millimetersPerPixel: 10, rotation: Math.PI / 2 },
    })
    const point = { x: 1250, y: 2500 }

    expect(hitTestUnderlay([underlay()], point)).toBeNull()
    expect(hitTestUnderlay([rotated], point)).toBe('underlay:u1')
  })
})
