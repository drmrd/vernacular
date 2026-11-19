import { describe, expect, it } from 'vitest'
import { DEFAULT_ENVIRONMENT_STATE, openingEnvironmentFor } from './environment-state'
import { DEFAULT_CLOUD_COVER } from './sky-model'
import type { Site } from '../model/site'
import type { Point } from '../model/types'
import type { FrontDirectionInput } from '../scene/front-direction'
import { WALL_NODE_PREFIX, type RoomSceneNode, type WallSceneNode } from '../scene/scene-graph'

const GROUND_FLOOR = 'ground'
const WALL_THICKNESS = 200
const ROOM_SIZE = 4000
const QUARTER_TURN = Math.PI / 2

const NORTH_UP: Site = { northBearing: 0 }
const NORTH_TURNED_A_QUARTER: Site = { northBearing: QUARTER_TURN }

const OPENING_DATE = '2026-03-20'
const SOUTH_FRONT_MINUTES = 630
const WEST_FRONT_MINUTES = 840

const SOUTH_WEST: Point = { x: 0, y: 0 }
const SOUTH_EAST: Point = { x: ROOM_SIZE, y: 0 }
const NORTH_EAST: Point = { x: ROOM_SIZE, y: ROOM_SIZE }
const NORTH_WEST: Point = { x: 0, y: ROOM_SIZE }
const ROOM_RING: readonly Point[] = [SOUTH_WEST, SOUTH_EAST, NORTH_EAST, NORTH_WEST]

function wallBetween(name: string, start: Point, end: Point): WallSceneNode {
  return {
    id: `${WALL_NODE_PREFIX}${name}`,
    kind: 'wall',
    floorId: GROUND_FLOOR,
    start,
    end,
    thickness: WALL_THICKNESS,
  }
}

/** A closed square room with no door: the code base finds its front as plan-down, the south side. */
function closedSquareRoom(): FrontDirectionInput {
  const room: RoomSceneNode = {
    id: 'room:closed',
    kind: 'room',
    floorId: GROUND_FLOOR,
    polygon: [...ROOM_RING],
    clearPolygon: [...ROOM_RING],
    area: 1,
  }
  const walls = [
    wallBetween('south', SOUTH_WEST, SOUTH_EAST),
    wallBetween('east', SOUTH_EAST, NORTH_EAST),
    wallBetween('north', NORTH_EAST, NORTH_WEST),
    wallBetween('west', NORTH_WEST, SOUTH_WEST),
  ]
  return { walls, rooms: [room], openings: [] }
}

describe('openingEnvironmentFor', () => {
  it('opens a room with its front to the south at 10:30 when the site has north up', () => {
    const environment = openingEnvironmentFor(NORTH_UP, closedSquareRoom())

    expect(environment).toEqual({
      ...DEFAULT_ENVIRONMENT_STATE,
      observedAt: { date: OPENING_DATE, minutesSinceMidnight: SOUTH_FRONT_MINUTES },
      cloudCover: DEFAULT_CLOUD_COVER,
    })
  })

  it('opens the same room at 14:00 when the site has its north turned a quarter', () => {
    const environment = openingEnvironmentFor(NORTH_TURNED_A_QUARTER, closedSquareRoom())

    expect(environment.observedAt).toEqual({
      date: OPENING_DATE,
      minutesSinceMidnight: WEST_FRONT_MINUTES,
    })
  })

  it('is the default environment state when the project has no site', () => {
    expect(openingEnvironmentFor(undefined, closedSquareRoom())).toEqual(DEFAULT_ENVIRONMENT_STATE)
  })
})
