import { describe, expect, it } from 'vitest'
import { linePath, pathEnd, pathLength, pathStart, wallPath } from './wall-path'

describe('wallPath', () => {
  it("builds a line path from a wall's two ends", () => {
    const path = wallPath({ start: { x: 0, y: 0 }, end: { x: 3000, y: 4000 } })

    expect(path.kind).toBe('line')
    expect(pathStart(path)).toEqual({ x: 0, y: 0 })
    expect(pathEnd(path)).toEqual({ x: 3000, y: 4000 })
  })

  it('freezes the path and its ends', () => {
    const fromWall = wallPath({ start: { x: 0, y: 0 }, end: { x: 3000, y: 4000 } })
    const fromPoints = linePath({ x: 0, y: 0 }, { x: 1000, y: 0 })

    for (const path of [fromWall, fromPoints]) {
      expect(Object.isFrozen(path)).toBe(true)
      expect(Object.isFrozen(pathStart(path))).toBe(true)
      expect(Object.isFrozen(pathEnd(path))).toBe(true)
    }
  })

  it('keeps its own copy of the ends', () => {
    const wall = { start: { x: 0, y: 0 }, end: { x: 3000, y: 4000 } }
    const path = wallPath(wall)

    wall.start.x = 9

    expect(pathStart(path)).toEqual({ x: 0, y: 0 })
  })
})

describe('pathLength', () => {
  it('measures the length of a line path', () => {
    const diagonal = wallPath({ start: { x: 0, y: 0 }, end: { x: 3000, y: 4000 } })

    expect(pathLength(diagonal)).toBe(5000)
  })
})
