// core/daylight/span-at-tolerance.test.ts
import { describe, expect, it } from 'vitest'
import type { Point } from '../model/types'
import type { Vector3 } from '../scene/vector3'
import type { DaylightAperture, DaylightRoom } from './daylight-field'
import { sampleSkyVisibility } from './daylight-field'
import { UNIFORM_SKY, createDaylightFieldSolver } from './sky-visibility'
import type { SkyLuminance } from './sky-visibility'

const TOLERANCE = 1e-12
const ROOM_WIDTH = 4000
const ROOM_DEPTH = 3000
const CEILING_HEIGHT = 2600
const SILL = 900
const HEAD = 2100
const GRAY = { r: 0.5, g: 0.5, b: 0.5 }
const WINDOW_START = 1000
const WINDOW_END = 2000
const PROBE_Y = 1550
const PROBE_X = 1500

/** Elevation of the sky patch that a window looks at, in radians. */
const ELEVATION = Math.atan(2 / Math.PI)
const COS = Math.cos(ELEVATION)
const SIN = Math.sin(ELEVATION)

const EAST_OUTWARD: Vector3 = { x: COS, y: SIN, z: 0 }
const WEST_OUTWARD: Vector3 = { x: -COS, y: SIN, z: 0 }
const NORTH_OUTWARD: Vector3 = { x: 0, y: SIN, z: -COS }

const alongY = (x: number): [Point, Point] => [
  { x, y: WINDOW_START },
  { x, y: WINDOW_END },
]
const alongX = (y: number): [Point, Point] => [
  { x: WINDOW_START, y },
  { x: WINDOW_END, y },
]

function roomWithSpan(span: readonly [Point, Point]): DaylightRoom {
  const window: DaylightAperture = {
    span,
    sill: SILL,
    head: HEAD,
    revealDepth: 0,
    opensTo: 'sky',
  }
  const outline: Point[] = [
    { x: 0, y: 0 },
    { x: ROOM_WIDTH, y: 0 },
    { x: ROOM_WIDTH, y: ROOM_DEPTH },
    { x: 0, y: ROOM_DEPTH },
  ]
  return { outline, ceilingHeight: CEILING_HEIGHT, floorColor: GRAY, apertures: [window] }
}

function directionsAskedFor(room: DaylightRoom): Vector3[] {
  const received: Vector3[] = []
  const recordingSky: SkyLuminance = (direction) => {
    received.push({ x: direction.x, y: direction.y, z: direction.z })
    return 1
  }
  createDaylightFieldSolver([room]).field(recordingSky)
  return received
}

describe('a window span that lies off its wall by exactly the outline tolerance', () => {
  it.each([
    {
      wall: 'east',
      side: 'inside',
      span: alongY(3999),
      outward: EAST_OUTWARD,
      probe: { x: 3050, y: PROBE_Y },
    },
    {
      wall: 'east',
      side: 'outside',
      span: alongY(4001),
      outward: EAST_OUTWARD,
      probe: { x: 3050, y: PROBE_Y },
    },
    {
      wall: 'west',
      side: 'inside',
      span: alongY(1),
      outward: WEST_OUTWARD,
      probe: { x: 950, y: PROBE_Y },
    },
    {
      wall: 'west',
      side: 'outside',
      span: alongY(-1),
      outward: WEST_OUTWARD,
      probe: { x: 950, y: PROBE_Y },
    },
    {
      wall: 'north',
      side: 'inside',
      span: alongX(2999),
      outward: NORTH_OUTWARD,
      probe: { x: PROBE_X, y: 2050 },
    },
    {
      wall: 'north',
      side: 'outside',
      span: alongX(3001),
      outward: NORTH_OUTWARD,
      probe: { x: PROBE_X, y: 2050 },
    },
  ])(
    'is accepted and faces outward on the $wall wall when it lies 1 mm $side the room',
    ({ span, outward, probe }) => {
      const room = roomWithSpan(span)

      const received = directionsAskedFor(room)

      expect(received.length).toBeGreaterThan(0)
      for (const direction of received) {
        expect(Math.abs(direction.x - outward.x)).toBeLessThan(TOLERANCE)
        expect(Math.abs(direction.y - outward.y)).toBeLessThan(TOLERANCE)
        expect(Math.abs(direction.z - outward.z)).toBeLessThan(TOLERANCE)
      }
      const solver = createDaylightFieldSolver([room])
      const field = solver.field(UNIFORM_SKY)
      const lit = sampleSkyVisibility(field, probe)
      expect(lit).toBeGreaterThan(solver.interreflection(0, UNIFORM_SKY))
    },
  )
})
