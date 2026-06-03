import { describe, expect, it } from 'vitest'
import { getEntry } from './registry'
import { ELEMENT_TYPE_REGISTRY_VERSION, builtinElementTypes } from './element-types'

describe('builtin element types', () => {
  it('seeds a straight wall and a single-swing door', () => {
    expect(getEntry(builtinElementTypes, 'straight-wall')?.category).toBe('wall')
    expect(getEntry(builtinElementTypes, 'single-swing-door')?.category).toBe('opening')
    expect(builtinElementTypes.version).toBe(ELEMENT_TYPE_REGISTRY_VERSION)
  })

  it('wires each entry to its 2D symbol and 3D builder', () => {
    const wall = getEntry(builtinElementTypes, 'straight-wall')
    expect(wall?.plan2D.symbol).toBe('wall-line')
    expect(wall?.scene3D.builder).toBe('extruded-wall')

    const door = getEntry(builtinElementTypes, 'single-swing-door')
    expect(door?.plan2D.symbol).toBe('door-swing')
    expect(door?.scene3D.builder).toBe('door-frame')
  })
})
