import { describe, expect, it } from 'vitest'
import { createEmptyProject, createFloor, createOpening, createWall } from '../model/factories'
import { entranceOf, frontDirection, PLAN_DOWN } from './front-direction'
import {
  box,
  EAST,
  expectDirection,
  floorNode,
  GROUND_FLOOR,
  NORTH,
  openingOn,
  point,
  roomOnFloor,
  ROOM_SIZE,
  sceneOf,
  singleRoom,
  SLIDING_GLASS_DOOR,
  SOUTH,
  UPPER_FLOOR,
  WEST,
  WINDOW_TYPE,
} from './front-direction-test-support'
import { OPENING_NODE_PREFIX, deriveSceneGraph, type OpeningSceneNode } from './scene-graph'

const UPPER_ELEVATION = 2700
const WIDE_DOOR = 1400
const WIDE_ROOM_RIGHT_EDGE = 2.5 * ROOM_SIZE

/** The same opening carrying the main entrance mark. */
function marked(opening: OpeningSceneNode): OpeningSceneNode {
  return { ...opening, entrance: true }
}

const TWO_FLOORS = [floorNode(GROUND_FLOOR, 0), floorNode(UPPER_FLOOR, UPPER_ELEVATION)]

describe('deriveSceneGraph with a marked door', () => {
  it('carries the mark on the marked opening node and on no other', () => {
    const project = createEmptyProject({
      name: 'House',
      units: 'metric',
      period: 'victorian',
      appVersion: '0.1.0',
    })
    const wall = createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, { id: 'w1' })
    const door = (id: string, position: number) =>
      createOpening({ type: 'single-swing-door', hostWallId: 'w1', position, id })
    project.floors = [
      {
        ...createFloor('Ground', { id: 'g', walls: [wall] }),
        openings: [{ ...door('plain', 1000) }, { ...door('chosen', 3000), entrance: true }],
      },
    ]

    const { openings } = deriveSceneGraph(project)

    const byId = (id: string) => openings.find((node) => node.id === `${OPENING_NODE_PREFIX}${id}`)
    expect(byId('chosen')).toHaveProperty('entrance', true)
    expect(byId('plain')).not.toHaveProperty('entrance')
  })
})

describe('entranceOf with a marked door', () => {
  it('returns the marked door over a wider hinged door on a lower floor', () => {
    const ground = roomOnFloor(GROUND_FLOOR)
    const upper = roomOnFloor(UPPER_FLOOR)
    const guessed = openingOn(ground.west, { id: 'guess', width: WIDE_DOOR })
    const chosen = marked(openingOn(upper.east, { id: 'chosen', type: SLIDING_GLASS_DOOR }))
    const input = { ...sceneOf([ground, upper], [guessed, chosen]), nodes: TWO_FLOORS }

    const entrance = entranceOf(input)

    expect(entrance.source).toBe('marked')
    expect(entrance.door?.id).toBe(chosen.id)
  })

  it('faces the outward normal of the exterior wall that hosts the marked door', () => {
    const room = singleRoom()
    const guessed = openingOn(room.south, { id: 'guess', width: WIDE_DOOR })
    const chosen = marked(openingOn(room.north, { id: 'chosen' }))

    const { front } = entranceOf(sceneOf([room], [guessed, chosen]))

    expectDirection(front, NORTH)
  })

  it('equals the front direction of the plan', () => {
    const room = singleRoom()
    const guessed = openingOn(room.south, { id: 'guess', width: WIDE_DOOR })
    const chosen = marked(openingOn(room.east, { id: 'chosen' }))
    const input = sceneOf([room], [guessed, chosen])

    expectDirection(frontDirection(input), EAST)
    expect(frontDirection(input)).toEqual(entranceOf(input).front)
  })
})

describe('entranceOf with a marked interior door', () => {
  // The partition between the rooms is the left room's east wall. The right room is
  // wider, so the walls' bounding box is centred at x = 5000, east of the partition.
  const left = roomOnFloor(GROUND_FLOOR, 'left')
  const right = box({
    name: 'right',
    floorId: GROUND_FLOOR,
    min: point(ROOM_SIZE, 0),
    max: point(WIDE_ROOM_RIGHT_EDGE, ROOM_SIZE),
  })
  const wideInput = (door: OpeningSceneNode) => ({
    walls: [left.south, left.north, left.west, left.east, right.south, right.north, right.east],
    rooms: [left.room, right.room],
    openings: [door],
  })

  it.each(['inward', 'outward'] as const)(
    'faces the side away from the wall center when its normal points %s',
    (normal) => {
      const partitionDoor = marked(openingOn(left.east, { id: 'chosen', normal }))

      const { front, source } = entranceOf(wideInput(partitionDoor))

      expect(source).toBe('marked')
      expectDirection(front, WEST)
    },
  )

  it.each(['inward', 'outward'] as const)(
    'faces plan-right when the door sits on a vertical line through the wall center (normal %s)',
    (normal) => {
      const even = box({
        name: 'even',
        floorId: GROUND_FLOOR,
        min: point(ROOM_SIZE, 0),
        max: point(2 * ROOM_SIZE, ROOM_SIZE),
      })
      const partitionDoor = marked(openingOn(left.east, { id: 'chosen', normal }))
      const input = {
        walls: [left.south, left.north, left.west, left.east, even.south, even.north, even.east],
        rooms: [left.room, even.room],
        openings: [partitionDoor],
      }

      const { front } = entranceOf(input)

      expectDirection(front, EAST)
    },
  )

  it.each(['inward', 'outward'] as const)(
    'faces plan-down when the door sits on a horizontal line through the wall center (normal %s)',
    (normal) => {
      const lower = roomOnFloor(GROUND_FLOOR, 'lower')
      const upper = box({
        name: 'upper',
        floorId: GROUND_FLOOR,
        min: point(0, ROOM_SIZE),
        max: point(ROOM_SIZE, 2 * ROOM_SIZE),
      })
      const partitionDoor = marked(openingOn(lower.north, { id: 'chosen', normal }))
      const guessed = openingOn(lower.west, { id: 'guess' })
      const input = {
        walls: [
          lower.south,
          lower.east,
          lower.north,
          lower.west,
          upper.east,
          upper.north,
          upper.west,
        ],
        rooms: [lower.room, upper.room],
        openings: [guessed, partitionDoor],
      }

      const { front } = entranceOf(input)

      expectDirection(front, SOUTH)
    },
  )
})

describe('entranceOf with two marked doors', () => {
  it('takes the first marked door in the order of the openings on a floor', () => {
    const room = singleRoom()
    const first = marked(openingOn(room.east, { id: 'z' }))
    const second = marked(openingOn(room.west, { id: 'a' }))

    const { door, front } = entranceOf(sceneOf([room], [first, second]))

    expect(door?.id).toBe(first.id)
    expectDirection(front, EAST)
  })

  it('takes the marked door on the floor that comes first in the walls', () => {
    const ground = roomOnFloor(GROUND_FLOOR)
    const upper = roomOnFloor(UPPER_FLOOR)
    const onGround = marked(openingOn(ground.west, { id: 'ground' }))
    const onUpper = marked(openingOn(upper.east, { id: 'upper' }))

    const { door } = entranceOf(sceneOf([upper, ground], [onGround, onUpper]))

    expect(door?.id).toBe(onUpper.id)
  })
})

describe('entranceOf with a mark on a window', () => {
  it('ignores the mark and guesses the door instead', () => {
    const room = singleRoom()
    const door = openingOn(room.east, { id: 'door' })
    const window = marked(openingOn(room.west, { id: 'window', type: WINDOW_TYPE }))

    const entrance = entranceOf(sceneOf([room], [window, door]))

    expect(entrance.source).toBe('guessed')
    expect(entrance.door?.id).toBe(door.id)
  })

  it('reports no entrance when the only marked opening is a window and there is no door', () => {
    const room = singleRoom()
    const window = marked(openingOn(room.west, { id: 'window', type: WINDOW_TYPE }))

    const entrance = entranceOf(sceneOf([room], [window]))

    expect(entrance).toEqual({ door: undefined, source: 'none', front: PLAN_DOWN })
  })

  it('skips a marked window to reach the marked door after it', () => {
    const room = singleRoom()
    const window = marked(openingOn(room.west, { id: 'window', type: WINDOW_TYPE }))
    const chosen = marked(openingOn(room.east, { id: 'chosen' }))

    const entrance = entranceOf(sceneOf([room], [window, chosen]))

    expect(entrance.source).toBe('marked')
    expect(entrance.door?.id).toBe(chosen.id)
  })
})
