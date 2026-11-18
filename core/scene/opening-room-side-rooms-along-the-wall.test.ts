import { describe, expect, it } from 'vitest'
import { openingRoomSide } from './opening-room-side'
import {
  ROOM_DEPTH,
  ROOM_WIDTH,
  WALL_THICKNESS,
  WINDOW_POSITION,
  counterClockwiseWalls,
  floorWithWindow,
  pt,
  windowNode,
} from './opening-room-side-test-fixtures'
import { deriveRoomNodesForFloor, type OpeningSceneNode, type RoomSceneNode } from './scene-graph'
import { courtyardFloor, longNorthWallFloor, nodesOf } from './wall-runs-test-fixtures'

const TINY_THICKNESS = 1
const THICK_WALL_THICKNESS = 400

describe('openingRoomSide along the rooms beside its wall', () => {
  describe('on a courtyard floor', () => {
    function courtyardDoor(): { door: OpeningSceneNode; rooms: RoomSceneNode[] } {
      const { rooms, openings } = nodesOf(courtyardFloor())
      const door = openings.find((opening) => opening.id.endsWith('courtyard-door'))
      if (door === undefined) {
        throw new Error('expected the courtyard floor to derive the courtyard door')
      }
      return { door, rooms }
    }

    it('has no room side for a door in a wall between a room and the courtyard room', () => {
      const { door, rooms } = courtyardDoor()

      expect(rooms).toHaveLength(2)
      expect(openingRoomSide(door, rooms, WALL_THICKNESS)).toBeUndefined()
    })

    it('puts the room side of the courtyard door on the courtyard when only the outer room is known', () => {
      const { door, rooms } = courtyardDoor()
      const outerRoom = rooms.filter((room) => room.holes?.length === 1)

      expect(outerRoom).toHaveLength(1)
      expect(door.normal.x).toBeCloseTo(0)
      expect(door.normal.y).toBeCloseTo(1)
      expect(openingRoomSide(door, outerRoom, WALL_THICKNESS)).toBe('negative')
    })
  })

  it('gives the same room side whatever wall thickness it is passed, and none at all', () => {
    const floor = floorWithWindow(counterClockwiseWalls(), 'south', WINDOW_POSITION)
    const rooms = deriveRoomNodesForFloor(floor)
    const node = windowNode(floor)

    const withoutThickness = openingRoomSide(node, rooms)

    expect(withoutThickness).toBe('positive')
    for (const thickness of [TINY_THICKNESS, WALL_THICKNESS, THICK_WALL_THICKNESS]) {
      expect(openingRoomSide(node, rooms, thickness)).toBe(withoutThickness)
    }
  })

  it('finds the room side of the front door and none for the far window on a long wall', () => {
    const { rooms, openings } = nodesOf(longNorthWallFloor())
    const sideOf = (suffix: string) =>
      openingRoomSide(
        openings.find((opening) => opening.id.endsWith(suffix))!,
        rooms,
        WALL_THICKNESS,
      )

    expect(sideOf('front-door')).toBe('negative')
    expect(sideOf('far-window')).toBeUndefined()
  })

  it('still points the room side of a window into a clockwise room built by hand', () => {
    const floor = floorWithWindow(counterClockwiseWalls(), 'south', WINDOW_POSITION)
    const node: OpeningSceneNode = { ...windowNode(floor), normal: pt(0, 1) }
    const corners = [pt(0, 0), pt(0, ROOM_DEPTH), pt(ROOM_WIDTH, ROOM_DEPTH), pt(ROOM_WIDTH, 0)]
    const clockwiseRoom: RoomSceneNode = {
      id: 'room:hand',
      kind: 'room',
      floorId: node.floorId,
      polygon: corners,
      clearPolygon: corners,
      area: 1,
      holes: [],
    }

    expect(openingRoomSide(node, [clockwiseRoom], WALL_THICKNESS)).toBe('positive')
  })
})
