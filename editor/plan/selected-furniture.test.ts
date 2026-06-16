import { describe, it, expect } from 'vitest'

import { createFurnitureInstance } from '../../core'
import type { FurnitureInstance } from '../../core'

import { singleSelectedFurniture } from './selected-furniture'

function fixture(id: string): FurnitureInstance {
  return createFurnitureInstance({
    id,
    assetRef: { scope: 'user', contentHash: 'h' },
    position: { x: 0, y: 0 },
    footprint: { width: 600, depth: 600 },
  })
}

describe('singleSelectedFurniture', () => {
  it('resolves the one selected furniture under the select tool', () => {
    const sofa = fixture('f1')
    const result = singleSelectedFurniture('select', new Set<string>(['f1']), [sofa])

    expect(result).toBe(sofa)
  })

  it('returns null when the selected id names no furniture instance', () => {
    const sofa = fixture('f1')
    const result = singleSelectedFurniture('select', new Set<string>(['missing']), [sofa])

    expect(result).toBeNull()
  })

  it('returns null when the active tool is not select', () => {
    const sofa = fixture('f1')
    const result = singleSelectedFurniture('place-furniture', new Set<string>(['f1']), [sofa])

    expect(result).toBeNull()
  })

  it('returns null unless exactly one id is selected', () => {
    const sofa = fixture('f1')
    const chair = fixture('f2')
    const furniture = [sofa, chair]

    expect(singleSelectedFurniture('select', new Set<string>([]), furniture)).toBeNull()
    expect(singleSelectedFurniture('select', new Set<string>(['f1', 'f2']), furniture)).toBeNull()
  })
})
