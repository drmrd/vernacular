import { describe, expect, it } from 'vitest'
import type { Opening, Point, Wall } from '../model/types'
import { createWall } from '../model/factories'
import { deriveOpeningGeometry, openingFootprint } from './openings'

const WALL_LENGTH = 2000
const OPENING_WIDTH = 800
const HALF_OPENING_WIDTH = OPENING_WIDTH / 2

function horizontalWall(): Wall {
  return createWall({ x: 0, y: 0 }, { x: WALL_LENGTH, y: 0 }, { id: 'host' })
}

function verticalWall(): Wall {
  return createWall({ x: 0, y: 0 }, { x: 0, y: WALL_LENGTH }, { id: 'host' })
}

function openingOn(host: Wall, width: number, position: number): Opening {
  return {
    id: 'opening-under-test',
    type: 'single-swing-door',
    hostWallId: host.id,
    position,
    width,
    height: 2032,
    sillHeight: 0,
    orientation: { hinge: 'start', facing: 'positive' },
  }
}

describe('deriveOpeningGeometry', () => {
  it('derives the center, along, normal, and jamb points on a horizontal wall', () => {
    const host = horizontalWall()
    const opening = openingOn(host, OPENING_WIDTH, 1000)

    const geometry = deriveOpeningGeometry(opening, host)

    expect(geometry.center).toEqual({ x: 1000, y: 0 })
    expect(geometry.along).toEqual({ x: 1, y: 0 })
    expect(geometry.normal).toEqual({ x: 0, y: 1 })
    expect(geometry.width).toBe(OPENING_WIDTH)
    expect(geometry.jambStart).toEqual({ x: 1000 - HALF_OPENING_WIDTH, y: 0 })
    expect(geometry.jambEnd).toEqual({ x: 1000 + HALF_OPENING_WIDTH, y: 0 })
  })

  it('orients along and the left-hand normal up a vertical wall', () => {
    const host = verticalWall()
    const opening = openingOn(host, OPENING_WIDTH, 500)

    const geometry = deriveOpeningGeometry(opening, host)

    expect(geometry.along).toEqual({ x: 0, y: 1 })
    expect(geometry.normal).toEqual({ x: -1, y: 0 })
    expect(geometry.center).toEqual({ x: 0, y: 500 })
    expect(geometry.jambStart).toEqual({ x: 0, y: 500 - HALF_OPENING_WIDTH })
    expect(geometry.jambEnd).toEqual({ x: 0, y: 500 + HALF_OPENING_WIDTH })
  })

  it('clamps a center past the wall end so the opening stays on the wall', () => {
    const host = horizontalWall()
    const opening = openingOn(host, OPENING_WIDTH, 1800)

    const geometry = deriveOpeningGeometry(opening, host)

    expect(geometry.center).toEqual({ x: WALL_LENGTH - HALF_OPENING_WIDTH, y: 0 })
  })

  it('clamps a center before the wall start so the opening stays on the wall', () => {
    const host = horizontalWall()
    const opening = openingOn(host, OPENING_WIDTH, -100)

    const geometry = deriveOpeningGeometry(opening, host)

    expect(geometry.center).toEqual({ x: HALF_OPENING_WIDTH, y: 0 })
  })

  it('clamps a too-wide opening to span the whole wall, centered at its midpoint', () => {
    const host = horizontalWall()
    const opening = openingOn(host, 3000, 1000)

    const geometry = deriveOpeningGeometry(opening, host)

    expect(geometry.width).toBe(WALL_LENGTH)
    expect(geometry.center).toEqual({ x: WALL_LENGTH / 2, y: 0 })
    expect(geometry.jambStart).toEqual({ x: 0, y: 0 })
    expect(geometry.jambEnd).toEqual({ x: WALL_LENGTH, y: 0 })
  })
})

describe('openingFootprint', () => {
  it('returns the four corners width-along-wall by thickness-across, centered on center', () => {
    const center: Point = { x: 1000, y: 0 }
    const along: Point = { x: 1, y: 0 }
    const normal: Point = { x: 0, y: 1 }
    const thickness = 100

    const corners = openingFootprint(center, along, normal, OPENING_WIDTH, thickness)

    expect(corners).toEqual([
      { x: 600, y: -50 },
      { x: 1400, y: -50 },
      { x: 1400, y: 50 },
      { x: 600, y: 50 },
    ])
  })
})
