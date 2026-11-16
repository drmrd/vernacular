import { describe, expect, it } from 'vitest'
import type { Point } from '../model/types'
import {
  frontDirection,
  PLAN_DOWN,
  type FrontDirectionInput,
  type PlanDirection,
} from './front-direction'
import {
  WALL_NODE_PREFIX,
  type OpeningSceneNode,
  type RoomSceneNode,
  type WallSceneNode,
} from './scene-graph'

const GROUND_FLOOR = 'ground'
const UPPER_FLOOR = 'upper'
const WALL_THICKNESS = 200
const ROOM_SIZE = 4000
const DEFAULT_DOOR_WIDTH = 900
const DOOR_TYPE = 'single-swing-door'
const WINDOW_TYPE = 'double-hung-window'
const UNIT_LENGTH_TOLERANCE = 9

const EAST: PlanDirection = { x: 1, y: 0 }
const WEST: PlanDirection = { x: -1, y: 0 }
const SOUTH: PlanDirection = { x: 0, y: -1 }

interface Box {
  readonly room: RoomSceneNode
  readonly south: WallSceneNode
  readonly east: WallSceneNode
  readonly north: WallSceneNode
  readonly west: WallSceneNode
}

interface BoxSpec {
  readonly name: string
  readonly floorId: string
  readonly min: Point
  readonly max: Point
}

interface DoorSpec {
  readonly id: string
  readonly type?: string
  readonly width?: number
  /** Which way the opening's own normal points: into the room by default. */
  readonly normal?: 'inward' | 'outward'
}

function point(x: number, y: number): Point {
  return { x, y }
}

function wall(id: string, floorId: string, edge: readonly [Point, Point]): WallSceneNode {
  const [start, end] = edge
  return {
    id: `${WALL_NODE_PREFIX}${id}`,
    kind: 'wall',
    floorId,
    start,
    end,
    thickness: WALL_THICKNESS,
  }
}

/** A counter-clockwise rectangular room with its four walls, y-up: south is the lowest-y wall. */
function box({ name, floorId, min, max }: BoxSpec): Box {
  const [southWest, southEast, northEast, northWest]: readonly [Point, Point, Point, Point] = [
    point(min.x, min.y),
    point(max.x, min.y),
    point(max.x, max.y),
    point(min.x, max.y),
  ]
  const ring = [southWest, southEast, northEast, northWest]
  return {
    room: {
      id: `room:${name}`,
      kind: 'room',
      floorId,
      polygon: ring,
      clearPolygon: ring,
      area: 1,
    },
    south: wall(`${name}-south`, floorId, [southWest, southEast]),
    east: wall(`${name}-east`, floorId, [southEast, northEast]),
    north: wall(`${name}-north`, floorId, [northEast, northWest]),
    west: wall(`${name}-west`, floorId, [northWest, southWest]),
  }
}

function singleRoom(): Box {
  return box({
    name: 'room',
    floorId: GROUND_FLOOR,
    min: point(0, 0),
    max: point(ROOM_SIZE, ROOM_SIZE),
  })
}

function wallsOf(...boxes: Box[]): WallSceneNode[] {
  return boxes.flatMap((each) => [each.south, each.east, each.north, each.west])
}

/**
 * An opening centred on `host`. Counter-clockwise walls have the room on their
 * left, so the left-hand normal points into the room.
 */
function openingOn(host: WallSceneNode, spec: DoorSpec): OpeningSceneNode {
  const length = Math.hypot(host.end.x - host.start.x, host.end.y - host.start.y)
  const along = point((host.end.x - host.start.x) / length, (host.end.y - host.start.y) / length)
  const inward = point(-along.y, along.x)
  const sign = spec.normal === 'outward' ? -1 : 1
  return {
    id: `opening:${spec.id}`,
    kind: 'opening',
    floorId: host.floorId,
    type: spec.type ?? DOOR_TYPE,
    center: point((host.start.x + host.end.x) / 2, (host.start.y + host.end.y) / 2),
    along,
    normal: point(inward.x * sign, inward.y * sign),
    width: spec.width ?? DEFAULT_DOOR_WIDTH,
    height: 2032,
    sillHeight: 0,
    hostThickness: WALL_THICKNESS,
    orientation: { hinge: 'start', facing: 'positive' },
    hostWallId: host.id.slice(WALL_NODE_PREFIX.length),
  }
}

function sceneOf(boxes: Box[], openings: OpeningSceneNode[]): FrontDirectionInput {
  return {
    walls: wallsOf(...boxes),
    rooms: boxes.map((each) => each.room),
    openings,
  }
}

function unitFrontDirection(input: FrontDirectionInput): PlanDirection {
  const front = frontDirection(input)
  expect(Math.hypot(front.x, front.y)).toBeCloseTo(1, UNIT_LENGTH_TOLERANCE)
  return front
}

function expectDirection(actual: PlanDirection, expected: PlanDirection): void {
  expect(actual.x).toBeCloseTo(expected.x, UNIT_LENGTH_TOLERANCE)
  expect(actual.y).toBeCloseTo(expected.y, UNIT_LENGTH_TOLERANCE)
}

describe('frontDirection', () => {
  it('faces plan-down for a room whose only door is in its south wall', () => {
    const room = singleRoom()

    const front = unitFrontDirection(sceneOf([room], [openingOn(room.south, { id: 'door' })]))

    expectDirection(front, SOUTH)
  })

  it('faces east for a room whose only door is in its east wall', () => {
    const room = singleRoom()

    const front = unitFrontDirection(sceneOf([room], [openingOn(room.east, { id: 'door' })]))

    expectDirection(front, EAST)
  })

  it.each(['inward', 'outward'] as const)(
    'takes the outward normal of the host wall when the opening normal points %s',
    (normal) => {
      const room = singleRoom()

      const front = unitFrontDirection(
        sceneOf([room], [openingOn(room.east, { id: 'door', normal })]),
      )

      expectDirection(front, EAST)
    },
  )

  it('prefers the wider of two exterior doors', () => {
    const room = singleRoom()
    const narrowSouth = openingOn(room.south, { id: 'narrow', width: 900 })
    const wideEast = openingOn(room.east, { id: 'wide', width: 1200 })

    const front = unitFrontDirection(sceneOf([room], [narrowSouth, wideEast]))

    expectDirection(front, EAST)
  })

  it('does not count a window that is wider than every door', () => {
    const room = singleRoom()
    const door = openingOn(room.east, { id: 'door', width: 800 })
    const wideWindow = openingOn(room.west, { id: 'window', type: WINDOW_TYPE, width: 3000 })

    const front = unitFrontDirection(sceneOf([room], [wideWindow, door]))

    expectDirection(front, EAST)
  })

  it('prefers the door whose outward direction is nearer plan-down when the widths are equal', () => {
    const room = singleRoom()
    const north = openingOn(room.north, { id: 'north' })
    const east = openingOn(room.east, { id: 'east' })

    const front = unitFrontDirection(sceneOf([room], [north, east]))

    expectDirection(front, EAST)
  })

  it('prefers the lower opening id when the widths and the directions are equal', () => {
    const room = singleRoom()
    const higherId = openingOn(room.east, { id: 'b' })
    const lowerId = openingOn(room.west, { id: 'a' })

    const front = unitFrontDirection(sceneOf([room], [higherId, lowerId]))

    expectDirection(front, WEST)
  })
})

const GABLE_AXIS_X = 100.1
const GABLE_DEPTH = 3000
const GABLE_HEIGHT = 4000

/**
 * A room whose two slanted south walls meet at an apex on the vertical line
 * x = GABLE_AXIS_X. Equal reaches make the walls mirror images about that line.
 * Returns the front for doors on both walls, given their opening ids.
 */
function gableFront(reaches: readonly [number, number], ids: readonly [string, string]) {
  const apex = point(GABLE_AXIS_X, -GABLE_DEPTH)
  const rightFoot = point(GABLE_AXIS_X + reaches[0], 0)
  const leftFoot = point(GABLE_AXIS_X - reaches[1], 0)
  const ring = [
    apex,
    rightFoot,
    point(rightFoot.x, GABLE_HEIGHT),
    point(leftFoot.x, GABLE_HEIGHT),
    leftFoot,
  ]
  const right = wall('right', GROUND_FLOOR, [apex, rightFoot])
  const left = wall('left', GROUND_FLOOR, [leftFoot, apex])
  const room: RoomSceneNode = {
    id: 'room:gable',
    kind: 'room',
    floorId: GROUND_FLOOR,
    polygon: ring,
    clearPolygon: ring,
    area: 1,
  }
  const openings = [openingOn(right, { id: ids[0] }), openingOn(left, { id: ids[1] })]
  return unitFrontDirection({ walls: [right, left], rooms: [room], openings })
}

describe('frontDirection when two fronts are nearly equally near plan-down', () => {
  // Mirror-image walls at a 3-4-5 slope face (+-0.6, -0.8). Their computed
  // dot products with plan-down differ by about 1e-16 of rounding noise.
  it('lets the lower opening id decide between mirror-image walls', () => {
    expectDirection(gableFront([4000, 4000], ['a', 'b']), { x: 0.6, y: -0.8 })
    expectDirection(gableFront([4000, 4000], ['b', 'a']), { x: -0.6, y: -0.8 })
  })

  // Reaches 4000 and 4014 give dot products of 0.8 and 0.80100462, a real difference.
  it('still prefers the nearer front when it differs by about 1e-3', () => {
    const nearer = { x: -0.598658163, y: -0.801004622 }

    expectDirection(gableFront([4000, 4014], ['a', 'b']), nearer)
    expectDirection(gableFront([4000, 4014], ['b', 'a']), nearer)
  })
})

describe('frontDirection with two rooms that share a wall', () => {
  const left = box({
    name: 'left',
    floorId: GROUND_FLOOR,
    min: point(0, 0),
    max: point(ROOM_SIZE, ROOM_SIZE),
  })
  const right = box({
    name: 'right',
    floorId: GROUND_FLOOR,
    min: point(ROOM_SIZE, 0),
    max: point(2 * ROOM_SIZE, ROOM_SIZE),
  })
  // The left room's east wall is the partition; the right room's west wall is the same wall.
  const input = (openings: OpeningSceneNode[]): FrontDirectionInput => ({
    walls: [left.south, left.north, left.west, left.east, right.south, right.north, right.east],
    rooms: [left.room, right.room],
    openings,
  })

  it('faces plan-down when the only door is an interior door', () => {
    const interiorDoor = openingOn(left.east, { id: 'interior' })

    const front = unitFrontDirection(input([interiorDoor]))

    expectDirection(front, PLAN_DOWN)
  })

  it('never lets an interior door win over an exterior door, however wide', () => {
    const interiorDoor = openingOn(left.east, { id: 'interior', width: 2000 })
    const exteriorDoor = openingOn(left.west, { id: 'exterior', width: 800 })

    const front = unitFrontDirection(input([interiorDoor, exteriorDoor]))

    expectDirection(front, WEST)
  })
})

describe('frontDirection on a plan with two floors', () => {
  it('judges a door on an upper floor against the rooms of its own floor', () => {
    const ground = box({
      name: 'ground',
      floorId: GROUND_FLOOR,
      min: point(0, 0),
      max: point(2 * ROOM_SIZE, ROOM_SIZE),
    })
    const upper = box({
      name: 'upper',
      floorId: UPPER_FLOOR,
      min: point(0, 0),
      max: point(ROOM_SIZE, ROOM_SIZE),
    })
    // The ground room lies beyond the upper room's east wall, so across floors that wall looks interior.
    const groundDoor = openingOn(ground.north, { id: 'ground', width: 900 })
    const upperDoor = openingOn(upper.east, { id: 'upper', width: 1000 })

    const front = unitFrontDirection(sceneOf([ground, upper], [groundDoor, upperDoor]))

    expectDirection(front, EAST)
  })
})

describe('frontDirection when there is nothing to take a front from', () => {
  it('faces plan-down for an empty plan', () => {
    const front = unitFrontDirection({ walls: [], rooms: [], openings: [] })

    expectDirection(front, PLAN_DOWN)
  })

  it('faces plan-down for a room with no opening', () => {
    const front = unitFrontDirection(sceneOf([singleRoom()], []))

    expectDirection(front, PLAN_DOWN)
  })

  it('faces plan-down for a room with windows but no door', () => {
    const room = singleRoom()
    const window = openingOn(room.east, { id: 'window', type: WINDOW_TYPE })

    const front = unitFrontDirection(sceneOf([room], [window]))

    expectDirection(front, PLAN_DOWN)
  })

  it('faces plan-down for a door when there is no room', () => {
    const room = singleRoom()
    const input = {
      walls: wallsOf(room),
      rooms: [],
      openings: [openingOn(room.east, { id: 'd' })],
    }

    expectDirection(unitFrontDirection(input), PLAN_DOWN)
  })

  it('faces plan-down for a door when there is no wall', () => {
    const room = singleRoom()
    const input = { walls: [], rooms: [room.room], openings: [openingOn(room.east, { id: 'd' })] }

    expectDirection(unitFrontDirection(input), PLAN_DOWN)
  })
})
