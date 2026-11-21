import { describe, it } from 'vitest'
import { PLAN_DOWN, type FrontDirectionInput } from './front-direction'
import {
  box,
  EAST,
  expectDirection,
  GROUND_FLOOR,
  openingOn,
  point,
  ROOM_SIZE,
  sceneOf,
  singleRoom,
  SOUTH,
  UPPER_FLOOR,
  unitFrontDirection,
  wall,
  wallsOf,
  WEST,
  WINDOW_TYPE,
} from './front-direction-test-support'
import type { OpeningSceneNode, RoomSceneNode } from './scene-graph'

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
  it('lets the opening id that sorts first decide between mirror-image walls', () => {
    expectDirection(gableFront([4000, 4000], ['a', 'b']), { x: 0.6, y: -0.8 })
    expectDirection(gableFront([4000, 4000], ['b', 'a']), { x: -0.6, y: -0.8 })
  })

  // 'opening:10' sorts before 'opening:9' as a string; a numeric order would pick the other wall.
  it('compares ids as strings, so opening:10 sorts first and wins over opening:9', () => {
    expectDirection(gableFront([4000, 4000], ['10', '9']), { x: 0.6, y: -0.8 })
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
