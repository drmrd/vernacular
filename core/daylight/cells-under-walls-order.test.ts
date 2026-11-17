// core/daylight/cells-under-walls-order.test.ts
import { describe, expect, it } from 'vitest'
import type { Point } from '../model/types'
import { SKY_VISIBILITY_CHANNEL, daylightFieldCellIndex } from './daylight-field'
import type { DaylightAperture, DaylightField, DaylightRoom } from './daylight-field'
import { UNIFORM_SKY, createDaylightFieldSolver } from './sky-visibility'

type Pair = readonly [number, number]

const OPEN_SKY = 1
const DARK = 0
const SIDE = 2000
const DEPTH = 3000
const ROW = 1550

function at([x, y]: Pair): Point {
  return { x, y }
}

function cellValue(field: DaylightField, point: Point): number {
  const column = Math.floor((point.x - field.origin.x) / field.cellSize)
  const row = Math.floor((point.y - field.origin.y) / field.cellSize)
  return field.data[daylightFieldCellIndex(field, column, row) + SKY_VISIBILITY_CHANNEL] ?? NaN
}

function windowOn(x: number, fromY: number, toY: number): DaylightAperture {
  const span: readonly [Point, Point] = [
    { x, y: fromY },
    { x, y: toY },
  ]
  return { span, sill: 900, head: 2100, revealDepth: 0, opensTo: 'sky' }
}

function room(outline: readonly Point[], apertures: readonly DaylightAperture[]): DaylightRoom {
  return {
    outline,
    ceilingHeight: 2600,
    floorColor: { r: 0.5, g: 0.5, b: 0.5 },
    apertures,
  }
}

function strip(minX: number, maxX: number): Point[] {
  return [
    { x: minX, y: 0 },
    { x: maxX, y: 0 },
    { x: maxX, y: DEPTH },
    { x: minX, y: DEPTH },
  ]
}

const WEST_WINDOW = windowOn(0, 1000, 2000)

function litStrip(maxX: number): DaylightRoom {
  return room(strip(0, maxX), [WEST_WINDOW])
}

function fieldOf(rooms: readonly DaylightRoom[]): DaylightField {
  return createDaylightFieldSolver(rooms).field(UNIFORM_SKY)
}

/** Asserts the cell holds exactly the value of the first ranked neighbor, and no other ranked neighbor holds it. */
function expectPicks(field: DaylightField, cell: Pair, ranked: readonly Pair[]) {
  const picked = cellValue(field, at(cell))
  for (const [index, neighbor] of ranked.entries()) {
    const expectation = expect(cellValue(field, at(neighbor)), `neighbor ${neighbor.join(', ')}`)
    if (index === 0) {
      expectation.toBe(picked)
    } else {
      expectation.not.toBe(picked)
    }
  }
}

describe('which neighbor a cell under a wall copies', () => {
  const wall = 100
  const firstEnd = 1900

  it('copies the first room in the input when two outlines are equally near', () => {
    // Catches: an equal distance resolved to the last room instead of the first.
    const lit = room(strip(0, firstEnd), [WEST_WINDOW])
    const dark = room(strip(firstEnd + wall, 3900), [])
    const underWall: Pair = [firstEnd + wall / 2, ROW]
    const litSide: Pair = [firstEnd - wall / 2, ROW]
    const darkSide: Pair = [firstEnd + wall + wall / 2, ROW]

    const litFirst = fieldOf([lit, dark])
    const darkFirst = fieldOf([dark, lit])

    expectPicks(litFirst, underWall, [litSide, darkSide])
    expectPicks(darkFirst, underWall, [darkSide, litSide])
    expect(cellValue(litFirst, at(darkSide))).toBe(DARK)
    expect(cellValue(litFirst, at(litSide))).toBeGreaterThan(DARK)
  })

  it('copies an edge neighbor before a diagonal neighbor of the same room', () => {
    // Catches: a diagonal neighbor taken ahead of an edge neighbor.
    const field = fieldOf([litStrip(SIDE)])

    expectPicks(
      field,
      [-50, 1050],
      [
        [50, 1050],
        [50, 950],
        [50, 1150],
      ],
    )
    expectPicks(
      field,
      [1050, -50],
      [
        [1050, 50],
        [950, 50],
        [1150, 50],
      ],
    )
  })
})

/** The square room with a notch cut from its south side, given as the path from one foot to the other. */
function notchedRoom(path: readonly Pair[]): DaylightRoom {
  const outline = [at([0, 0]), ...path.map(at), at([SIDE, 0]), at([SIDE, DEPTH]), at([0, DEPTH])]
  return room(outline, [WEST_WINDOW])
}

const EDGE_PAIRS_WINDOW_EAST = windowOn(SIDE, 1200, 1800)

/** A room with a one-cell-wide slit entering from the west side, so that a slit cell has room cells above and below. */
function roomWithWestSlit(): DaylightRoom {
  const outline: Pair[] = [
    [0, 0],
    [SIDE, 0],
    [SIDE, DEPTH],
    [0, DEPTH],
    [0, 1100],
    [1500, 1100],
    [1500, 1000],
    [0, 1000],
  ]
  return room(outline.map(at), [EDGE_PAIRS_WINDOW_EAST])
}

describe('the order among the edge neighbors of a cell under a wall', () => {
  const southSlit: Pair[] = [
    [1000, 0],
    [1000, 1500],
    [1100, 1500],
    [1100, 0],
  ]

  it('copies left before right, below and above', () => {
    // Catches: the left neighbor not tried first among the edge neighbors.
    const field = fieldOf([notchedRoom(southSlit)])

    expectPicks(
      field,
      [1050, 1450],
      [
        [950, 1450],
        [1150, 1450],
        [1050, 1550],
      ],
    )
  })

  it('copies right before below and above', () => {
    // Catches: the right neighbor not tried ahead of the below and above neighbors.
    const field = fieldOf([roomWithWestSlit()])

    expectPicks(
      field,
      [1450, 1050],
      [
        [1550, 1050],
        [1450, 950],
        [1450, 1150],
      ],
    )
  })

  it('copies below before above', () => {
    // Catches: the above neighbor tried ahead of the below neighbor.
    const field = fieldOf([roomWithWestSlit()])

    expectPicks(
      field,
      [750, 1050],
      [
        [750, 950],
        [750, 1150],
      ],
    )
  })
})

describe('the order among the diagonal neighbors of a cell under a wall', () => {
  const center: Pair = [1050, 1050]
  const lowerLeft: Pair = [950, 950]
  const lowerRight: Pair = [1150, 950]
  const upperLeft: Pair = [950, 1150]
  const upperRight: Pair = [1150, 1150]
  // A plus-shaped notch around the center cell leaves the center with no edge neighbor in the room.
  const plusFromSouth: Pair[] = [
    [1000, 0],
    [1000, 1000],
    [900, 1000],
    [900, 1100],
    [1000, 1100],
    [1000, 1200],
    [1100, 1200],
    [1100, 1100],
    [1200, 1100],
    [1200, 1000],
    [1100, 1000],
    [1100, 0],
  ]
  // The same plus with the lower left corner cell added to the notch.
  const withoutLowerLeft: Pair[] = [[1000, 0], [1000, 900], [900, 900], ...plusFromSouth.slice(3)]
  // The same plus with both lower corner cells added to the notch.
  const withoutLowerCorners: Pair[] = [
    ...withoutLowerLeft.slice(0, 8),
    [1200, 1100],
    [1200, 900],
    [1100, 900],
    [1100, 0],
  ]

  it('copies the lower left neighbor before the other three diagonals', () => {
    // Catches: the lower left diagonal not tried first among the diagonal neighbors.
    const field = fieldOf([notchedRoom(plusFromSouth)])

    expectPicks(field, center, [lowerLeft, lowerRight, upperLeft, upperRight])
  })

  it('copies the lower right neighbor before the upper diagonals', () => {
    // Catches: a lower right diagonal taken after an upper diagonal.
    const field = fieldOf([notchedRoom(withoutLowerLeft)])

    expectPicks(field, center, [lowerRight, upperLeft, upperRight])
  })

  it('copies the upper left neighbor before the upper right neighbor', () => {
    // Catches: the upper right diagonal taken ahead of the upper left diagonal.
    const field = fieldOf([notchedRoom(withoutLowerCorners)])

    expectPicks(field, center, [upperLeft, upperRight])
  })
})

describe('a room open to the sky beside a closed room', () => {
  const underWall: Pair = [1950, ROW]
  const closedSide: Pair = [1850, ROW]
  const openSide: Pair = [2050, ROW]

  function openRoom(minX: number): DaylightRoom {
    return { ...room(strip(minX, 4000), []), openToSky: true }
  }

  it('is a source for the cell under the wall when its outline is the nearer one', () => {
    // Catches: a room open to the sky left out of the sources, so that the closed room is copied instead.
    const field = fieldOf([litStrip(1880), openRoom(1980)])

    expect(cellValue(field, at(closedSide))).toBeLessThan(OPEN_SKY)
    expect(cellValue(field, at(openSide))).toBe(OPEN_SKY)
    expectPicks(field, underWall, [openSide, closedSide])
  })

  it('is passed over for the cell under the wall when the closed room outline is nearer', () => {
    // Catches: the open room preferred to the nearer closed room, or the open value used for every cell.
    const field = fieldOf([openRoom(2020), litStrip(1920)])

    expectPicks(field, underWall, [closedSide, openSide])
  })
})
