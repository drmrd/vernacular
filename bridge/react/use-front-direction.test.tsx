import type { ReactNode } from 'react'
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import type { OpeningSceneNode, Point, RoomSceneNode, SceneGraph, WallSceneNode } from '../../core'
import { EditorSessionProvider } from './editor-session-provider'
import type { EditorSession } from '../../session'
import { useFrontDirection } from './use-front-direction'

afterEach(cleanup)

const GROUND_FLOOR = 'ground'
const WALL_THICKNESS = 200
const ROOM_SIZE = 4000
const DOOR_WIDTH = 900
const DOOR_HEIGHT = 2032
const COORDINATE_PRECISION = 9

const SOUTH_WEST: Point = { x: 0, y: 0 }
const SOUTH_EAST: Point = { x: ROOM_SIZE, y: 0 }
const NORTH_EAST: Point = { x: ROOM_SIZE, y: ROOM_SIZE }
const NORTH_WEST: Point = { x: 0, y: ROOM_SIZE }
const ROOM_RING = [SOUTH_WEST, SOUTH_EAST, NORTH_EAST, NORTH_WEST]

const ROOM: RoomSceneNode = {
  id: 'room:parlor',
  kind: 'room',
  floorId: GROUND_FLOOR,
  polygon: ROOM_RING,
  clearPolygon: ROOM_RING,
  area: 1,
}

const EAST_WALL: WallSceneNode = {
  id: 'wall:east',
  kind: 'wall',
  floorId: GROUND_FLOOR,
  start: SOUTH_EAST,
  end: NORTH_EAST,
  thickness: WALL_THICKNESS,
}

// A door centred on the east wall. Its own normal points into the room (west), as the
// scene graph derives it for a counter-clockwise room.
const EAST_DOOR: OpeningSceneNode = {
  id: 'opening:door',
  kind: 'opening',
  floorId: GROUND_FLOOR,
  type: 'single-swing-door',
  center: { x: ROOM_SIZE, y: ROOM_SIZE / 2 },
  along: { x: 0, y: 1 },
  normal: { x: -1, y: 0 },
  width: DOOR_WIDTH,
  height: DOOR_HEIGHT,
  sillHeight: 0,
  hostThickness: WALL_THICKNESS,
  orientation: { hinge: 'start', facing: 'positive' },
  hostWallId: 'east',
}

const GRAPH_WITH_EAST_DOOR = {
  nodes: [],
  walls: [EAST_WALL],
  rooms: [ROOM],
  underlays: [],
  openings: [EAST_DOOR],
  dimensions: [],
  stairs: [],
  furniture: [],
} satisfies SceneGraph

// The hook reads only the session's scene graph and its subscription, so a session that
// holds one fixed graph is enough to put a project in front of it.
function sessionHolding(graph: SceneGraph): EditorSession {
  return {
    getSceneGraph: () => graph,
    subscribe: () => () => {},
  } as unknown as EditorSession
}

function sessionAround(session: EditorSession) {
  return function SessionWrapper({ children }: { children: ReactNode }) {
    return <EditorSessionProvider session={session}>{children}</EditorSessionProvider>
  }
}

describe('useFrontDirection', () => {
  it('faces east for a project whose widest exterior door is in the east wall', () => {
    const { result } = renderHook(() => useFrontDirection(), {
      wrapper: sessionAround(sessionHolding(GRAPH_WITH_EAST_DOOR)),
    })

    expect(result.current.x).toBeCloseTo(1, COORDINATE_PRECISION)
    expect(result.current.y).toBeCloseTo(0, COORDINATE_PRECISION)
  })
})
