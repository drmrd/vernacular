// core/daylight/net-transmittance.test.ts
import { describe, expect, it } from 'vitest'
import type { Point } from '../model/types'
import type { DaylightAperture, DaylightRoom } from './daylight-field'
import { sampleSkyVisibility } from './daylight-field'
import { horizontalPointToWallRectangle } from './form-factor'
import {
  DAYLIGHT_WORK_PLANE_HEIGHT_MM,
  UNIFORM_SKY,
  createDaylightFieldSolver,
} from './sky-visibility'

const TOLERANCE = 1e-6
const HALF = 0.5
const ROOM_WIDTH = 4000
const ROOM_DEPTH = 3000
const CEILING_HEIGHT = 2600
const SILL = 900
const HEAD = 2100
const WINDOW_START = 1000
const WINDOW_WIDTH = 1000
const DOORWAY_SILL = 0
const DOORWAY_WIDTH = 1000
const DOORWAY_START = 1000
const GRAY = { r: 0.5, g: 0.5, b: 0.5 }
const CELL_CENTER = { x: 3050, y: 1550 }
const WINDOW_NEAR_EDGE_MM = -550
const WINDOW_FAR_EDGE_MM = 450
const FOOT_TO_WALL_MM = 950

function rectangleOutline(x0: number, x1: number): Point[] {
  return [
    { x: x0, y: 0 },
    { x: x1, y: 0 },
    { x: x1, y: ROOM_DEPTH },
    { x: x0, y: ROOM_DEPTH },
  ]
}

function roomWithEastWindow(netTransmittance: number): DaylightRoom {
  const window: DaylightAperture = {
    span: [
      { x: ROOM_WIDTH, y: WINDOW_START },
      { x: ROOM_WIDTH, y: WINDOW_START + WINDOW_WIDTH },
    ],
    sill: SILL,
    head: HEAD,
    revealDepth: 0,
    opensTo: 'sky',
    netTransmittance,
  }
  return {
    outline: rectangleOutline(0, ROOM_WIDTH),
    ceilingHeight: CEILING_HEIGHT,
    floorColor: GRAY,
    apertures: [window],
  }
}

function roomsWithDoorwayToOpenSky(netTransmittance: number): DaylightRoom[] {
  const doorway: DaylightAperture = {
    span: [
      { x: ROOM_WIDTH, y: DOORWAY_START },
      { x: ROOM_WIDTH, y: DOORWAY_START + DOORWAY_WIDTH },
    ],
    sill: DOORWAY_SILL,
    head: HEAD,
    revealDepth: 0,
    opensTo: { room: 1 },
    netTransmittance,
  }
  return [
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
}

describe('the net transmittance of an aperture', () => {
  it('scales the light that a window lets into the room', () => {
    const solver = createDaylightFieldSolver([roomWithEastWindow(HALF)])
    const expected = HALF * HALF * WINDOW_WIDTH * (HEAD - SILL)
    expect(Math.abs(solver.enteringFlux(0, UNIFORM_SKY) - expected)).toBeLessThan(TOLERANCE)
  })

  it('scales the direct light of a window-lit cell but not the inter-reflection', () => {
    const solver = createDaylightFieldSolver([roomWithEastWindow(HALF)])
    const factor = horizontalPointToWallRectangle(
      {
        x0: WINDOW_NEAR_EDGE_MM,
        x1: WINDOW_FAR_EDGE_MM,
        z0: SILL - DAYLIGHT_WORK_PLANE_HEIGHT_MM,
        z1: HEAD - DAYLIGHT_WORK_PLANE_HEIGHT_MM,
      },
      FOOT_TO_WALL_MM,
    )
    const expected = HALF * factor + solver.interreflection(0, UNIFORM_SKY)
    const sampled = sampleSkyVisibility(solver.field(UNIFORM_SKY), CELL_CENTER)
    expect(Math.abs(sampled - expected)).toBeLessThan(TOLERANCE)
  })

  it('scales the light that a doorway to a room open to the sky passes', () => {
    const solver = createDaylightFieldSolver(roomsWithDoorwayToOpenSky(HALF))
    const expected = HALF * HALF * DOORWAY_WIDTH * (HEAD - DOORWAY_SILL)
    expect(Math.abs(solver.enteringFlux(0, UNIFORM_SKY) - expected)).toBeLessThan(TOLERANCE)
  })
})
