import { describe, expect, it } from 'vitest'
import type { Point } from '../model/types'
import { dimensionGeometry, dimensionLength } from './dimension'

describe('dimensionLength', () => {
  it('returns the straight-line distance between the measured endpoints', () => {
    expect(dimensionLength({ start: { x: 0, y: 0 }, end: { x: 300, y: 400 } })).toBe(500)
  })
})

describe('dimensionGeometry', () => {
  it('places the dimension line on the measured segment when the offset is zero', () => {
    const start: Point = { x: 0, y: 0 }
    const end: Point = { x: 1000, y: 0 }

    const geometry = dimensionGeometry(start, end, 0)

    expect(geometry.lineStart).toEqual({ x: 0, y: 0 })
    expect(geometry.lineEnd).toEqual({ x: 1000, y: 0 })
  })

  it('collapses the extension segments to zero length when the offset is zero', () => {
    const geometry = dimensionGeometry({ x: 0, y: 0 }, { x: 1000, y: 0 }, 0)

    expect(geometry.extensionStart).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ])
    expect(geometry.extensionEnd).toEqual([
      { x: 1000, y: 0 },
      { x: 1000, y: 0 },
    ])
  })

  it('shifts the dimension line along the left-hand normal of start to end', () => {
    const geometry = dimensionGeometry({ x: 0, y: 0 }, { x: 1000, y: 0 }, 200)

    expect(geometry.lineStart).toEqual({ x: 0, y: 200 })
    expect(geometry.lineEnd).toEqual({ x: 1000, y: 200 })
  })

  it('spans each extension segment from its measured point to its dimension-line end', () => {
    const geometry = dimensionGeometry({ x: 0, y: 0 }, { x: 1000, y: 0 }, 200)

    expect(geometry.extensionStart).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 200 },
    ])
    expect(geometry.extensionEnd).toEqual([
      { x: 1000, y: 0 },
      { x: 1000, y: 200 },
    ])
  })
})
