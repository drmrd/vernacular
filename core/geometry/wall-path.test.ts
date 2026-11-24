import { describe, expect, it } from 'vitest'
import { linePath, pathEnd, pathLength, pathStart, pointAlong, wallPath } from './wall-path'
import type { Point } from '../model/types'

const DIAGONAL = wallPath({ start: { x: 0, y: 0 }, end: { x: 3000, y: 4000 } })

function expectPointNear(actual: Point, expected: Point): void {
  expect(actual.x).toBeCloseTo(expected.x, 9)
  expect(actual.y).toBeCloseTo(expected.y, 9)
}

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
    expect(pathLength(DIAGONAL)).toBe(5000)
  })
})

describe('pointAlong', () => {
  it('finds the point at a distance along the path', () => {
    expectPointNear(pointAlong(DIAGONAL, 2500), { x: 1500, y: 2000 })
    expectPointNear(pointAlong(DIAGONAL, 0), { x: 0, y: 0 })
  })
})
