import { describe, expect, it } from 'vitest'
import { getEntry } from './registry'
import { ELEMENT_TYPE_REGISTRY_VERSION, builtinElementTypes } from './element-types'

describe('builtin element types', () => {
  it('seeds a straight wall and a single-swing door', () => {
    expect(getEntry(builtinElementTypes, 'straight-wall')?.category).toBe('wall')
    expect(getEntry(builtinElementTypes, 'single-swing-door')?.category).toBe('opening')
    expect(builtinElementTypes.version).toBe(ELEMENT_TYPE_REGISTRY_VERSION)
  })

  it('carries both a 2D symbol and a 3D builder for each entry', () => {
    const wall = getEntry(builtinElementTypes, 'straight-wall')
    expect(wall?.plan2D.symbol).toBeTruthy()
    expect(wall?.scene3D.builder).toBeTruthy()
  })
})
