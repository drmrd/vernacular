import { describe, it, expect } from 'vitest'

import type { StairSceneNode } from '../../core'

import { singleSelectedStair } from './selected-stair'

function fixture(id: string): StairSceneNode {
  return {
    id,
    kind: 'stair',
    floorId: 'ground',
    wellFloorId: 'upper',
    runType: 'straight',
    position: { x: 0, y: 0 },
    width: 1000,
    length: 3000,
    rotation: 0,
  }
}

describe('singleSelectedStair', () => {
  it('resolves the one selected stair under the select tool', () => {
    const run = fixture('stair:s1')
    const result = singleSelectedStair('select', new Set<string>(['stair:s1']), [run])

    expect(result).toBe(run)
  })

  it('returns null when the selected id names no stair', () => {
    const run = fixture('stair:s1')
    const result = singleSelectedStair('select', new Set<string>(['wall:w1']), [run])

    expect(result).toBeNull()
  })

  it('returns null when the active tool is not select', () => {
    const run = fixture('stair:s1')
    const result = singleSelectedStair('place-stair', new Set<string>(['stair:s1']), [run])

    expect(result).toBeNull()
  })

  it('returns null unless exactly one id is selected', () => {
    const stairs = [fixture('stair:s1'), fixture('stair:s2')]

    expect(singleSelectedStair('select', new Set<string>([]), stairs)).toBeNull()
    expect(
      singleSelectedStair('select', new Set<string>(['stair:s1', 'stair:s2']), stairs),
    ).toBeNull()
  })
})
