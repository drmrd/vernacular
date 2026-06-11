import { describe, it, expect } from 'vitest'
import { wallVerticalSpan, floorSlabVerticalSpan } from './vertical-datum'

describe('vertical datum', () => {
  it('places a wall base at local Y = 0 and its top at Y = height', () => {
    expect(wallVerticalSpan(2700)).toEqual({ base: 0, top: 2700 })
  })

  it('flushes a floor slab top with the finished floor and extends thickness below', () => {
    expect(floorSlabVerticalSpan(150)).toEqual({ top: 0, bottom: -150 })
  })
})
