import { describe, expect, it } from 'vitest'

import { dot, leftNormal, leftPerp, shift, subtract, unit } from './vector'

describe('vector helpers', () => {
  it('subtracts component-wise', () => {
    expect(subtract({ x: 5, y: 7 }, { x: 2, y: 3 })).toEqual({ x: 3, y: 4 })
  })

  it('dots two vectors', () => {
    expect(dot({ x: 2, y: 3 }, { x: 4, y: 5 })).toBe(23)
  })

  it('scales a vector to unit length', () => {
    expect(unit({ x: 3, y: 4 })).toEqual({ x: 0.6, y: 0.8 })
  })

  it('rotates a vector to its left-hand perpendicular', () => {
    expect(leftPerp({ x: 3, y: 5 })).toEqual({ x: -5, y: 3 })
  })

  it('gives the unit left-hand normal of a direction', () => {
    expect(leftNormal({ x: 0, y: 0 }, { x: 0, y: 10 })).toEqual({ x: -1, y: 0 })
  })

  it('shifts a point along a direction by a distance', () => {
    expect(shift({ x: 1, y: 1 }, { x: 0, y: 1 }, 5)).toEqual({ x: 1, y: 6 })
  })
})
