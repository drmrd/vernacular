import { describe, expect, it } from 'vitest'

import { createFurnitureInstance, type FurnitureInstance } from '../../core'
import { toDrawableFurniture } from './drawable-furniture'

function makeFurniture(id: string): FurnitureInstance {
  return createFurnitureInstance({
    assetRef: { scope: 'user', contentHash: 'hash-1' },
    position: { x: 0, y: 0 },
    footprint: { width: 600, depth: 600 },
    id,
  })
}

describe('toDrawableFurniture', () => {
  it('maps each instance through unchanged as instance, preserving order and identity', () => {
    const first = makeFurniture('f1')
    const second = makeFurniture('f2')

    const result = toDrawableFurniture([first, second], new Set<string>())

    expect(result).toHaveLength(2)
    expect(result[0]?.instance).toBe(first)
    expect(result[1]?.instance).toBe(second)
  })

  it('marks selected true exactly when selectedIds contains the instance id', () => {
    const selected = makeFurniture('f1')
    const unselected = makeFurniture('f2')

    const result = toDrawableFurniture([selected, unselected], new Set(['f1']))

    expect(result[0]?.selected).toBe(true)
    expect(result[1]?.selected).toBe(false)
  })
})
