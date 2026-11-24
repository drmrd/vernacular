import { describe, expect, it } from 'vitest'
import {
  linePath,
  normalAlong,
  pathEnd,
  pathLength,
  pathStart,
  pointAlong,
  projectOntoPath,
  tangentAlong,
  wallPath,
} from './wall-path'
import type { Point } from '../model/types'

const DIAGONAL = wallPath({ start: { x: 0, y: 0 }, end: { x: 3000, y: 4000 } })
const HORIZONTAL = linePath({ x: 0, y: 0 }, { x: 1000, y: 0 })

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

describe('tangentAlong', () => {
  it('gives the unit tangent from start to end', () => {
    expectPointNear(tangentAlong(DIAGONAL, 2500), { x: 0.6, y: 0.8 })
  })
})

describe('normalAlong', () => {
  it('gives the unit normal to the left of start to end', () => {
    expectPointNear(normalAlong(DIAGONAL, 2500), { x: -0.8, y: 0.6 })
  })
})

describe('projectOntoPath', () => {
  it('projects a point onto the path with its signed offset', () => {
    const projection = projectOntoPath(HORIZONTAL, { x: 400, y: 250 })

    expectPointNear(projection.point, { x: 400, y: 0 })
    expect(projection.along).toBe(400)
    expect(projection.offset).toBe(250)
  })

  it('gives a negative offset on the right of the path', () => {
    const projection = projectOntoPath(HORIZONTAL, { x: 400, y: -250 })

    expectPointNear(projection.point, { x: 400, y: 0 })
    expect(projection.offset).toBe(-250)
  })
})
