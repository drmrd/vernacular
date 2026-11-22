import { expect } from 'vitest'
import type { Point } from '../model/types'
import { frontDirection, type FrontDirectionInput, type PlanDirection } from './front-direction'
import {
  FLOOR_NODE_PREFIX,
  WALL_NODE_PREFIX,
  type OpeningSceneNode,
  type RoomSceneNode,
  type SceneNode,
  type WallSceneNode,
} from './scene-graph'

export const GROUND_FLOOR = 'ground'
export const UPPER_FLOOR = 'upper'
const WALL_THICKNESS = 200
export const ROOM_SIZE = 4000
const DEFAULT_DOOR_WIDTH = 900
export const SWING_DOOR = 'single-swing-door'
export const SWING_WIDTH = 813
export const SLIDING_GLASS_DOOR = 'sliding-glass-door'
export const SLIDING_GLASS_WIDTH = 1829
export const WINDOW_TYPE = 'double-hung-window'
const DIRECTION_DECIMAL_PLACES = 9

const DOOR_HEIGHT = 2032

export const EAST: PlanDirection = { x: 1, y: 0 }
export const WEST: PlanDirection = { x: -1, y: 0 }
export const SOUTH: PlanDirection = { x: 0, y: -1 }
export const NORTH: PlanDirection = { x: 0, y: 1 }

export interface Box {
  readonly room: RoomSceneNode
  readonly south: WallSceneNode
  readonly east: WallSceneNode
  readonly north: WallSceneNode
  readonly west: WallSceneNode
}

export interface BoxSpec {
  readonly name: string
  readonly floorId: string
  readonly min: Point
  readonly max: Point
}

export interface DoorSpec {
  readonly id: string
  readonly type?: string
  readonly width?: number
  /** Which way the opening's own normal points: into the room by default. */
  readonly normal?: 'inward' | 'outward'
}

export function point(x: number, y: number): Point {
  return { x, y }
}

export function wall(id: string, floorId: string, edge: readonly [Point, Point]): WallSceneNode {
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
export function box({ name, floorId, min, max }: BoxSpec): Box {
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

/** A room of the standard size with its south-west corner at the origin, named after its floor by default. */
export function roomOnFloor(floorId: string, name: string = floorId): Box {
  return box({ name, floorId, min: point(0, 0), max: point(ROOM_SIZE, ROOM_SIZE) })
}

export function singleRoom(): Box {
  return box({
    name: 'room',
    floorId: GROUND_FLOOR,
    min: point(0, 0),
    max: point(ROOM_SIZE, ROOM_SIZE),
  })
}

export function wallsOf(...boxes: Box[]): WallSceneNode[] {
  return boxes.flatMap((each) => [each.south, each.east, each.north, each.west])
}

/**
 * An opening centred on `host`. Counter-clockwise walls have the room on their
 * left, so the left-hand normal points into the room.
 */
export function openingOn(host: WallSceneNode, spec: DoorSpec): OpeningSceneNode {
  const length = Math.hypot(host.end.x - host.start.x, host.end.y - host.start.y)
  const along = point((host.end.x - host.start.x) / length, (host.end.y - host.start.y) / length)
  const inward = point(-along.y, along.x)
  const sign = spec.normal === 'outward' ? -1 : 1
  return {
    id: `opening:${spec.id}`,
    kind: 'opening',
    floorId: host.floorId,
    type: spec.type ?? SWING_DOOR,
    center: point((host.start.x + host.end.x) / 2, (host.start.y + host.end.y) / 2),
    along,
    normal: point(inward.x * sign, inward.y * sign),
    width: spec.width ?? DEFAULT_DOOR_WIDTH,
    height: DOOR_HEIGHT,
    sillHeight: 0,
    hostThickness: WALL_THICKNESS,
    orientation: { hinge: 'start', facing: 'positive' },
    hostWallId: host.id.slice(WALL_NODE_PREFIX.length),
  }
}

export function sceneOf(boxes: Box[], openings: OpeningSceneNode[]): FrontDirectionInput {
  return {
    walls: wallsOf(...boxes),
    rooms: boxes.map((each) => each.room),
    openings,
  }
}

/** A floor node as the scene graph derives it: id `floor:<floorId>`. */
export function floorNode(floorId: string, elevation: number): SceneNode {
  return { id: `${FLOOR_NODE_PREFIX}${floorId}`, kind: 'floor', name: floorId, elevation }
}

export function unitFrontDirection(input: FrontDirectionInput): PlanDirection {
  const front = frontDirection(input)
  expect(Math.hypot(front.x, front.y)).toBeCloseTo(1, DIRECTION_DECIMAL_PLACES)
  return front
}

export function expectDirection(actual: PlanDirection, expected: PlanDirection): void {
  expect(actual.x).toBeCloseTo(expected.x, DIRECTION_DECIMAL_PLACES)
  expect(actual.y).toBeCloseTo(expected.y, DIRECTION_DECIMAL_PLACES)
}
