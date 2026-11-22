// core/daylight/doorway-test-support.ts
import type { LinearRgb } from '../color/oklab'
import type { Point } from '../model/types'
import type { DaylightAperture, DaylightRoom } from './daylight-field'

const TEST_ROOM_WIDTH = 4000
const TEST_ROOM_DEPTH = 3000
const TEST_HALL_WIDTH = 2000
const TEST_CEILING_HEIGHT = 2600
const WINDOW_SILL = 900
const WINDOW_HEAD = 2100
const DOORWAY_HEAD = 2100
const DOORWAY_START = 1000
const DOORWAY_END = 2000
const SOURCE_HALL_WIDTH = 3000
const EXTREME_WIDTH = 100
const EXTREME_DEPTH = 40000
const EXTREME_CEILING_HEIGHT = 6000

export const GRAY: LinearRgb = { r: 0.5, g: 0.5, b: 0.5 }
export const WHITE: LinearRgb = { r: 1, g: 1, b: 1 }

export function rectangleOutline(x0: number, x1: number, y1: number): Point[] {
  return [
    { x: x0, y: 0 },
    { x: x1, y: 0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ]
}

export function verticalSpan(x: number, y0: number, y1: number): readonly [Point, Point] {
  return [
    { x, y: y0 },
    { x, y: y1 },
  ]
}

/** A 4000 by 3000 mm room with one window on its east wall, 1000 mm wide. */
export const testRoom: DaylightRoom = {
  outline: rectangleOutline(0, TEST_ROOM_WIDTH, TEST_ROOM_DEPTH),
  ceilingHeight: TEST_CEILING_HEIGHT,
  floorColor: GRAY,
  apertures: [
    {
      span: verticalSpan(TEST_ROOM_WIDTH, DOORWAY_START, DOORWAY_END),
      sill: WINDOW_SILL,
      head: WINDOW_HEAD,
      revealDepth: 0,
      opensTo: 'sky',
    },
  ],
}

/** A hall west of the test room, joined by a 1000 mm wide doorway on x = 0 that opens to room 0. */
export const hall: DaylightRoom = {
  outline: rectangleOutline(-TEST_HALL_WIDTH, 0, TEST_ROOM_DEPTH),
  ceilingHeight: TEST_CEILING_HEIGHT,
  floorColor: GRAY,
  apertures: [
    {
      span: verticalSpan(0, DOORWAY_START, DOORWAY_END),
      sill: 0,
      head: DOORWAY_HEAD,
      revealDepth: 0,
      opensTo: { room: 0 },
    },
  ],
}

export interface SourceAndHallsOptions {
  width: number
  depth: number
  floorColor: LinearRgb
  ceilingHeight: number
  /** How many 3000 mm halls open along the long walls of the source: one east, or one on each side. */
  halls: 1 | 2
}

function hallBeside(side: 'east' | 'west', source: SourceAndHallsOptions): DaylightRoom {
  const { width, depth, ceilingHeight } = source
  const wallX = side === 'east' ? width : 0
  const [x0, x1] = side === 'east' ? [width, width + SOURCE_HALL_WIDTH] : [-SOURCE_HALL_WIDTH, 0]
  const doorway: DaylightAperture = {
    span: verticalSpan(wallX, 0, depth),
    sill: 0,
    head: ceilingHeight,
    revealDepth: 0,
    opensTo: { room: 0 },
  }
  return {
    outline: rectangleOutline(x0, x1, depth),
    ceilingHeight,
    floorColor: GRAY,
    apertures: [doorway],
  }
}

/**
 * Room 0 is a source lit by one window along its whole north wall. Room 1 is a hall east of it
 * with a doorway along the whole shared wall; with two halls, room 2 is the same hall to the west.
 */
export function sourceAndHalls(options: SourceAndHallsOptions): DaylightRoom[] {
  const { width, depth, floorColor, ceilingHeight, halls } = options
  const window: DaylightAperture = {
    span: [
      { x: 0, y: depth },
      { x: width, y: depth },
    ],
    sill: 0,
    head: ceilingHeight,
    revealDepth: 0,
    opensTo: 'sky',
  }
  const source: DaylightRoom = {
    outline: rectangleOutline(0, width, depth),
    ceilingHeight,
    floorColor,
    apertures: [window],
  }
  const east = hallBeside('east', options)
  if (halls === 1) return [source, east]
  return [source, east, hallBeside('west', options)]
}

export interface SweepRow {
  width: number
  depth: number
  floorColor: LinearRgb
  ceilingHeight: number
  /** The floor's reflectance, for test titles. */
  label: number
}

/** Four source shapes, each with a gray and a white floor, under a 2600 mm ceiling. */
export const ORDINARY_SWEEP_ROWS: readonly SweepRow[] = [
  { width: 500, depth: 6000 },
  { width: 1000, depth: 6000 },
  { width: 1000, depth: 10000 },
  { width: 2000, depth: 8000 },
].flatMap((size) =>
  [GRAY, WHITE].map((floorColor) => ({
    ...size,
    floorColor,
    ceilingHeight: TEST_CEILING_HEIGHT,
    label: floorColor.r,
  })),
)

/** A source 100 by 40000 mm under a 6000 mm ceiling with a white floor. */
export const EXTREME_SWEEP_ROW: SweepRow = {
  width: EXTREME_WIDTH,
  depth: EXTREME_DEPTH,
  floorColor: WHITE,
  ceilingHeight: EXTREME_CEILING_HEIGHT,
  label: 1,
}
