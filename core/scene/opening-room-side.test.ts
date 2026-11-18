import { describe, expect, it } from 'vitest'
import type { Wall } from '../model/types'
import { effectiveWallThickness } from './construction-profile'
import { exteriorWalls } from './exterior-walls'
import { openingRoomSide } from './opening-room-side'
import {
  ROOM_DEPTH,
  ROOM_WIDTH,
  THICK_RAW_WALL_MM,
  THIN_PROFILE,
  WALL_THICKNESS,
  WINDOW_POSITION,
  counterClockwiseWalls,
  floorWithWindow,
  pt,
  roomSideOfWindow,
  wall,
  windowNode,
} from './opening-room-side-test-fixtures'
import { deriveRoomNodesForFloor, deriveWallNode, type RoomSceneNode } from './scene-graph'

/** The same room drawn the other way: every wall reversed and the order reversed. */
function clockwiseWalls(): Wall[] {
  return [
    wall('west', pt(0, 0), pt(0, ROOM_DEPTH)),
    wall('north', pt(0, ROOM_DEPTH), pt(ROOM_WIDTH, ROOM_DEPTH)),
    wall('east', pt(ROOM_WIDTH, ROOM_DEPTH), pt(ROOM_WIDTH, 0)),
    wall('south', pt(ROOM_WIDTH, 0), pt(0, 0)),
  ]
}

describe('openingRoomSide', () => {
  it('points into the room for a window on the wall of a room drawn counter-clockwise', () => {
    const floor = floorWithWindow(counterClockwiseWalls(), 'south', WINDOW_POSITION)

    expect(deriveRoomNodesForFloor(floor)).toHaveLength(1)
    expect(roomSideOfWindow(floor)).toBe('positive')
  })

  it('points into the room for a window on the same room drawn clockwise', () => {
    const floor = floorWithWindow(clockwiseWalls(), 'south', WINDOW_POSITION)

    expect(deriveRoomNodesForFloor(floor)).toHaveLength(1)
    expect(roomSideOfWindow(floor)).toBe('negative')
  })

  it('has no single room side for a window on a wall between two rooms', () => {
    const walls = [
      wall('south-left', pt(0, 0), pt(2000, 0)),
      wall('partition', pt(2000, 0), pt(2000, ROOM_DEPTH)),
      wall('north-left', pt(2000, ROOM_DEPTH), pt(0, ROOM_DEPTH)),
      wall('west', pt(0, ROOM_DEPTH), pt(0, 0)),
      wall('south-right', pt(2000, 0), pt(ROOM_WIDTH, 0)),
      wall('east', pt(ROOM_WIDTH, 0), pt(ROOM_WIDTH, ROOM_DEPTH)),
      wall('north-right', pt(ROOM_WIDTH, ROOM_DEPTH), pt(2000, ROOM_DEPTH)),
    ]
    const floor = floorWithWindow(walls, 'partition', ROOM_DEPTH / 2)

    expect(deriveRoomNodesForFloor(floor)).toHaveLength(2)
    expect(roomSideOfWindow(floor)).toBeUndefined()
  })

  it('has no room side for a window on a free-standing wall that bounds no room', () => {
    const floor = floorWithWindow(
      [wall('lone', pt(0, 0), pt(ROOM_WIDTH, 0))],
      'lone',
      WINDOW_POSITION,
    )

    expect(deriveRoomNodesForFloor(floor)).toHaveLength(0)
    expect(roomSideOfWindow(floor)).toBeUndefined()
  })

  describe('on a long wall that bounds a room along only part of its length', () => {
    const LONG_WALL_LENGTH = 10000
    const WINDOW_AWAY_FROM_ROOM = 7000
    const walls = [
      wall('long-south', pt(0, 0), pt(LONG_WALL_LENGTH, 0)),
      wall('east', pt(ROOM_WIDTH, 0), pt(ROOM_WIDTH, ROOM_DEPTH)),
      wall('north', pt(ROOM_WIDTH, ROOM_DEPTH), pt(0, ROOM_DEPTH)),
      wall('west', pt(0, ROOM_DEPTH), pt(0, 0)),
    ]

    it('finds the room side for a window beside the room', () => {
      const floor = floorWithWindow(walls, 'long-south', WINDOW_POSITION)

      expect(roomSideOfWindow(floor)).toBe('positive')
    })

    it('finds no room side for a window away from the room, on the same wall', () => {
      const floor = floorWithWindow(walls, 'long-south', WINDOW_AWAY_FROM_ROOM)

      expect(roomSideOfWindow(floor)).toBeUndefined()
    })

    it('differs from the wall-midpoint test, which does not list this wall as exterior', () => {
      const floor = floorWithWindow(walls, 'long-south', WINDOW_POSITION)
      const wallNodes = floor.walls.map((raw) => deriveWallNode(floor, raw))

      const exteriorIds = exteriorWalls(wallNodes, deriveRoomNodesForFloor(floor)).map(
        (exterior) => exterior.wallId,
      )

      expect(exteriorIds).not.toContain('wall:long-south')
    })
  })

  it('ignores rooms of another floor that cover the sample points', () => {
    const floor = floorWithWindow(counterClockwiseWalls(), 'south', WINDOW_POSITION)
    const roomsOfAnotherFloor: RoomSceneNode[] = deriveRoomNodesForFloor(floor).map((room) => ({
      ...room,
      floorId: 'other-floor',
    }))

    expect(openingRoomSide(windowNode(floor), roomsOfAnotherFloor, WALL_THICKNESS)).toBeUndefined()
  })

  it('still finds the room side when the construction profile makes the host wall thinner than its raw thickness', () => {
    const walls = counterClockwiseWalls().map((raw) =>
      raw.id === 'south'
        ? { ...raw, thickness: THICK_RAW_WALL_MM, constructionProfile: THIN_PROFILE }
        : raw,
    )
    const floor = floorWithWindow(walls, 'south', WINDOW_POSITION)
    const host = walls[0]!

    expect(effectiveWallThickness(host)).toBeLessThan(THICK_RAW_WALL_MM)
    expect(roomSideOfWindow(floor)).toBe('positive')
  })
})
