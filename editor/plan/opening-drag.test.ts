import { describe, it, expect } from 'vitest'
import { createWall, type Wall } from '../../core'
import { openingDragPosition } from './opening-drag'

const WALL_THICKNESS_MM = 114
const WALL_LENGTH_MM = 2000
const PERPENDICULAR_OFFSET_MM = 80

function host(end: { x: number; y: number }): Wall {
  return createWall({ x: 0, y: 0 }, end, { id: 'w1', thickness: WALL_THICKNESS_MM })
}

describe('openingDragPosition', () => {
  it('projects the world point onto a horizontal wall, ignoring the perpendicular offset', () => {
    const wall = host({ x: WALL_LENGTH_MM, y: 0 })

    expect(openingDragPosition(wall, { x: 1300, y: PERPENDICULAR_OFFSET_MM })).toBe(1300)
  })

  it('projects the world point onto a vertical wall, ignoring the perpendicular offset', () => {
    const wall = host({ x: 0, y: WALL_LENGTH_MM })

    expect(openingDragPosition(wall, { x: 50, y: 700 })).toBe(700)
  })

  it('returns a negative position for a point before the wall start without clamping', () => {
    const wall = host({ x: WALL_LENGTH_MM, y: 0 })

    expect(openingDragPosition(wall, { x: -100, y: 0 })).toBe(-100)
  })
})
