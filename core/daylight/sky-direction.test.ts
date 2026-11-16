// core/daylight/sky-direction.test.ts
import { describe, expect, it } from 'vitest'
import type { Point } from '../model/types'
import type { Vector3 } from '../scene/vector3'
import type { DaylightAperture, DaylightRoom } from './daylight-field'
import { UNIFORM_SKY, createDaylightFieldSolver } from './sky-visibility'
import type { SkyLuminance } from './sky-visibility'

const TOLERANCE = 1e-12
const FLUX_TOLERANCE = 1e-6
const ROOM_WIDTH = 4000
const ROOM_DEPTH = 3000
const CEILING_HEIGHT = 2600
const SILL = 900
const HEAD = 2100
const DOORWAY_SILL = 0
const DOORWAY_WIDTH = 1000
const DOORWAY_START = 1000
const DIM_SKY_LEVEL = 0.25
const GRAY = { r: 0.5, g: 0.5, b: 0.5 }
const WINDOW_START = 1000
const WINDOW_END = 2000

/** Elevation of the sky patch that a window looks at, in radians. */
const ELEVATION = Math.atan(2 / Math.PI)
const COS = Math.cos(ELEVATION)
const SIN = Math.sin(ELEVATION)

function rectangleOutline(x0: number, x1: number): Point[] {
  return [
    { x: x0, y: 0 },
    { x: x1, y: 0 },
    { x: x1, y: ROOM_DEPTH },
    { x: x0, y: ROOM_DEPTH },
  ]
}

function roomWithSpan(span: readonly [Point, Point]): DaylightRoom {
  const window: DaylightAperture = { span, sill: SILL, head: HEAD, revealDepth: 0, opensTo: 'sky' }
  return {
    outline: rectangleOutline(0, ROOM_WIDTH),
    ceilingHeight: CEILING_HEIGHT,
    floorColor: GRAY,
    apertures: [window],
  }
}

const northSpan = (): [Point, Point] => [
  { x: WINDOW_START, y: ROOM_DEPTH },
  { x: WINDOW_END, y: ROOM_DEPTH },
]
const southSpan = (): [Point, Point] => [
  { x: WINDOW_START, y: 0 },
  { x: WINDOW_END, y: 0 },
]
const westSpan = (): [Point, Point] => [
  { x: 0, y: WINDOW_START },
  { x: 0, y: WINDOW_END },
]
const eastSpan = (): [Point, Point] => [
  { x: ROOM_WIDTH, y: WINDOW_START },
  { x: ROOM_WIDTH, y: WINDOW_END },
]

function directionsAskedFor(room: DaylightRoom): Vector3[] {
  const received: Vector3[] = []
  const recordingSky: SkyLuminance = (direction) => {
    received.push({ x: direction.x, y: direction.y, z: direction.z })
    return 1
  }
  createDaylightFieldSolver([room]).field(recordingSky)
  return received
}

function expectEveryDirectionToEqual(received: readonly Vector3[], expected: Vector3): void {
  expect(received.length).toBeGreaterThan(0)
  for (const direction of received) {
    expect(Math.abs(direction.x - expected.x)).toBeLessThan(TOLERANCE)
    expect(Math.abs(direction.y - expected.y)).toBeLessThan(TOLERANCE)
    expect(Math.abs(direction.z - expected.z)).toBeLessThan(TOLERANCE)
  }
}

describe('the sky direction that a window asks for', () => {
  it('looks north and up for a window on the wall at the largest plan y', () => {
    const received = directionsAskedFor(roomWithSpan(northSpan()))
    expectEveryDirectionToEqual(received, { x: 0, y: SIN, z: -COS })
  })

  it('looks south and up for a window on the wall at the smallest plan y', () => {
    const received = directionsAskedFor(roomWithSpan(southSpan()))
    expectEveryDirectionToEqual(received, { x: 0, y: SIN, z: COS })
  })

  it('looks west and up for a window on the wall at the smallest plan x', () => {
    const received = directionsAskedFor(roomWithSpan(westSpan()))
    expectEveryDirectionToEqual(received, { x: -COS, y: SIN, z: 0 })
  })

  it('looks east and up for a window on the wall at the largest plan x', () => {
    const received = directionsAskedFor(roomWithSpan(eastSpan()))
    expectEveryDirectionToEqual(received, { x: COS, y: SIN, z: 0 })
  })

  it('asks for the same direction when the end points of the north span are swapped', () => {
    const [first, second] = northSpan()
    const received = directionsAskedFor(roomWithSpan([second, first]))
    expectEveryDirectionToEqual(received, { x: 0, y: SIN, z: -COS })
  })
})

describe('a doorway into a room that is open to the sky', () => {
  const doorway: DaylightAperture = {
    span: [
      { x: ROOM_WIDTH, y: DOORWAY_START },
      { x: ROOM_WIDTH, y: DOORWAY_START + DOORWAY_WIDTH },
    ],
    sill: DOORWAY_SILL,
    head: HEAD,
    revealDepth: 0,
    opensTo: { room: 1 },
  }
  const rooms: DaylightRoom[] = [
    {
      outline: rectangleOutline(0, ROOM_WIDTH),
      ceilingHeight: CEILING_HEIGHT,
      floorColor: GRAY,
      apertures: [doorway],
    },
    {
      outline: rectangleOutline(ROOM_WIDTH, 2 * ROOM_WIDTH),
      ceilingHeight: CEILING_HEIGHT,
      floorColor: GRAY,
      apertures: [],
      openToSky: true,
    },
  ]
  const doorwayFlux = (DOORWAY_WIDTH * (HEAD - DOORWAY_SILL)) / 2
  const enteringFlux = (sky: SkyLuminance): number =>
    createDaylightFieldSolver(rooms).enteringFlux(0, sky)

  it('passes half of its area under a uniform sky', () => {
    expect(Math.abs(enteringFlux(UNIFORM_SKY) - doorwayFlux)).toBeLessThan(FLUX_TOLERANCE)
  })

  it('passes half of its area under a sky that is dim in every direction', () => {
    const dimSky: SkyLuminance = () => DIM_SKY_LEVEL
    expect(Math.abs(enteringFlux(dimSky) - doorwayFlux)).toBeLessThan(FLUX_TOLERANCE)
  })

  it('passes half of its area under a sky that is black in every direction', () => {
    const blackSky: SkyLuminance = () => 0
    expect(Math.abs(enteringFlux(blackSky) - doorwayFlux)).toBeLessThan(FLUX_TOLERANCE)
  })
})
