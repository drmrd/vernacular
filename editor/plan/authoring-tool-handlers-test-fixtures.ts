import { vi } from 'vitest'
import type { EditorSession } from '../../bridge'
import type { Opening, SceneGraph, WallSceneNode } from '../../core'

export const FLOOR_ID = 'g'
// The wall runs along y = 0, so a candidate at y = 0 lands on it and one 500 mm
// away is well clear of the hit tolerance, mirroring use-opening-placement.test.ts.
export const WALL_LENGTH_MM = 2000
export const WALL_THICKNESS_MM = 114
export const WALL_MIDPOINT_X = 1000
export const CLEAR_OF_WALL_Y = 500
export const DOOR_TYPE = 'single-swing-door'

/** A session whose floor holds the given openings; `dispatch` defaults to a fresh mock. */
export function sessionWithOpenings(
  openings: readonly Opening[],
  dispatch: ReturnType<typeof vi.fn> = vi.fn(),
): EditorSession {
  return {
    dispatch,
    getProject: () => ({ floors: [{ id: FLOOR_ID, openings }] }),
  } as unknown as EditorSession
}

function horizontalWall(): WallSceneNode {
  return {
    id: 'wall:w1',
    kind: 'wall',
    floorId: FLOOR_ID,
    start: { x: 0, y: 0 },
    end: { x: WALL_LENGTH_MM, y: 0 },
    thickness: WALL_THICKNESS_MM,
  }
}

export function graphWithOneWall(): SceneGraph {
  return {
    nodes: [],
    walls: [horizontalWall()],
    rooms: [],
    underlays: [],
    openings: [],
    dimensions: [],
    stairs: [],
    furniture: [],
  }
}
