import { describe, expect, it } from 'vitest'
import {
  linePath,
  normalAlong,
  offsetPath,
  pathBounds,
  pathEnd,
  pathLength,
  pathStart,
  pointAlong,
  projectOntoPath,
  reversePath,
  rotatePath,
  subPath,
  tangentAlong,
  translatePath,
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

  it('clamps a point past the end to the end', () => {
    const projection = projectOntoPath(HORIZONTAL, { x: 1500, y: 300 })

    expect(projection.along).toBe(1000)
    expectPointNear(projection.point, { x: 1000, y: 0 })
    expect(projection.offset).toBe(300)
  })

  it('clamps a point before the start to the start', () => {
    const projection = projectOntoPath(HORIZONTAL, { x: -200, y: -50 })

    expect(projection.along).toBe(0)
    expectPointNear(projection.point, { x: 0, y: 0 })
    expect(projection.offset).toBe(-50)
  })
})

describe('pathBounds', () => {
  it('bounds the path by its ends', () => {
    const path = linePath({ x: 300, y: -200 }, { x: -100, y: 500 })

    expect(pathBounds(path)).toEqual({ min: { x: -100, y: -200 }, max: { x: 300, y: 500 } })
  })
})

describe('subPath', () => {
  it('cuts the part between two distances', () => {
    const part = subPath(HORIZONTAL, 200, 700)

    expect(part.kind).toBe('line')
    expectPointNear(pathStart(part), { x: 200, y: 0 })
    expectPointNear(pathEnd(part), { x: 700, y: 0 })
  })
})

describe('offsetPath', () => {
  it("offsets the path to the normal's side", () => {
    const shifted = offsetPath(HORIZONTAL, 100)

    expectPointNear(pathStart(shifted), { x: 0, y: 100 })
    expectPointNear(pathEnd(shifted), { x: 1000, y: 100 })
  })

  it('offsets the path to the other side for a negative distance', () => {
    const shifted = offsetPath(HORIZONTAL, -100)

    expectPointNear(pathStart(shifted), { x: 0, y: -100 })
    expectPointNear(pathEnd(shifted), { x: 1000, y: -100 })
  })
})

describe('translatePath', () => {
  it('moves the path by a delta', () => {
    const moved = translatePath(HORIZONTAL, { x: 50, y: -30 })

    expectPointNear(pathStart(moved), { x: 50, y: -30 })
    expectPointNear(pathEnd(moved), { x: 1050, y: -30 })
  })
})

describe('rotatePath', () => {
  it('turns the path about a pivot', () => {
    const turned = rotatePath(HORIZONTAL, { x: 0, y: 0 }, Math.PI / 2)

    expectPointNear(pathStart(turned), { x: 0, y: 0 })
    expectPointNear(pathEnd(turned), { x: 0, y: 1000 })
  })
})

describe('reversePath', () => {
  it('swaps the ends', () => {
    const reversed = reversePath(HORIZONTAL)

    expectPointNear(pathStart(reversed), { x: 1000, y: 0 })
    expectPointNear(pathEnd(reversed), { x: 0, y: 0 })
  })
})
