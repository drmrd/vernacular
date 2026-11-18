import { describe, expect, it } from 'vitest'
import { effectiveWallThickness } from './construction-profile'
import { openingRoomSide } from './opening-room-side'
import {
  ROOM_DEPTH,
  ROOM_WIDTH,
  THIN_PROFILE,
  WALL_THICKNESS,
  WINDOW_POSITION,
  counterClockwiseWalls,
  floorWithWindow,
  floorWithWindowSpec,
  pt,
  roomSideOfWindow,
  wall,
  windowNode,
  withWall,
} from './opening-room-side-test-fixtures'
import { deriveRoomNodesForFloor, type RoomSceneNode } from './scene-graph'

describe('openingRoomSide past the face that the room uses', () => {
  const THIN_PROFILE_RAW_THICKNESS = 400
  const CORNER_WINDOW_WIDTH = 300
  const CORNER_WINDOW_POSITION = 150
  const THICK_NEIGHBOR_THICKNESS = 400
  const MASONRY_PROFILE = 'solid-masonry-brick'
  const HALF_DRAWN_THICKNESS = WALL_THICKNESS / 2

  it('finds the room side when the raw thickness is 400 mm and the profile only 115 mm', () => {
    const walls = withWall(counterClockwiseWalls(), 'south', {
      thickness: THIN_PROFILE_RAW_THICKNESS,
      constructionProfile: THIN_PROFILE,
    })
    const floor = floorWithWindow(walls, 'south', WINDOW_POSITION)

    expect(roomSideOfWindow(floor)).toBe('positive')
  })

  it('finds the room side when the room is inset by a profile thicker than the raw thickness', () => {
    const walls = withWall(counterClockwiseWalls(), 'south', {
      constructionProfile: MASONRY_PROFILE,
    })
    const floor = floorWithWindow(walls, 'south', WINDOW_POSITION)
    const southFace = effectiveWallThickness(walls[0]!) / 2
    const northFace = ROOM_DEPTH - HALF_DRAWN_THICKNESS
    const westFace = HALF_DRAWN_THICKNESS
    const eastFace = ROOM_WIDTH - HALF_DRAWN_THICKNESS
    const [room] = deriveRoomNodesForFloor(floor)
    const profileInsetRoom: RoomSceneNode = {
      ...room!,
      clearPolygon: [
        pt(westFace, southFace),
        pt(eastFace, southFace),
        pt(eastFace, northFace),
        pt(westFace, northFace),
      ],
    }

    const side = openingRoomSide(windowNode(floor), [profileInsetRoom], WALL_THICKNESS)

    expect(side).toBe('positive')
  })

  it('finds the room side for a window 150 mm from an inside corner, clear of the neighbor wall', () => {
    const floor = floorWithWindowSpec(counterClockwiseWalls(), {
      hostWallId: 'south',
      position: CORNER_WINDOW_POSITION,
      width: CORNER_WINDOW_WIDTH,
    })

    expect(roomSideOfWindow(floor)).toBe('positive')
  })

  it('finds no side for a window 150 mm from an inside corner whose neighbor wall is 400 mm thick', () => {
    const walls = withWall(counterClockwiseWalls(), 'west', {
      thickness: THICK_NEIGHBOR_THICKNESS,
    })
    const floor = floorWithWindowSpec(walls, {
      hostWallId: 'south',
      position: CORNER_WINDOW_POSITION,
      width: CORNER_WINDOW_WIDTH,
    })

    expect(roomSideOfWindow(floor)).toBeUndefined()
  })

  it('finds the room side for a window 150 mm from the reflex corner of an L-shaped room', () => {
    const walls = [
      wall('south', pt(0, 0), pt(ROOM_WIDTH, 0)),
      wall('east-low', pt(ROOM_WIDTH, 0), pt(ROOM_WIDTH, 1500)),
      wall('inner-ledge', pt(ROOM_WIDTH, 1500), pt(2000, 1500)),
      wall('inner-rise', pt(2000, 1500), pt(2000, ROOM_DEPTH)),
      wall('north', pt(2000, ROOM_DEPTH), pt(0, ROOM_DEPTH)),
      wall('west', pt(0, ROOM_DEPTH), pt(0, 0)),
    ]
    const ledgePositionBesideCorner = 1850
    const floor = floorWithWindowSpec(walls, {
      hostWallId: 'inner-ledge',
      position: ledgePositionBesideCorner,
      width: CORNER_WINDOW_WIDTH,
    })

    expect(deriveRoomNodesForFloor(floor)).toHaveLength(1)
    expect(roomSideOfWindow(floor)).toBe('positive')
  })

  it('finds no side for a window on a free wall that stands inside one room', () => {
    const island = wall('island', pt(1000, 1500), pt(3000, 1500))
    const floor = floorWithWindow([...counterClockwiseWalls(), island], 'island', 1000)

    expect(deriveRoomNodesForFloor(floor)).toHaveLength(1)
    expect(roomSideOfWindow(floor)).toBeUndefined()
  })
})
