import { FLOOR_NODE_PREFIX, createEmptyProject } from '../../core'
import type { Floor, Project, RoomSceneNode, SceneGraph, SceneNode } from '../../core'
import { isGroundPlane } from '../../engine'
import type { FramedScene } from './framed-scene'

// The scene-graph and project fixtures the reconciler dispose suites share: ground and upper
// floor nodes, a graph with one wall per named floor, and lookups into a built scene. The
// engine testing entry is not available to a support module in bridge/, so the suites that
// look up a group by entity id keep their own groupOf.

export const FLOOR_ID = 'g'
export const FLOOR_NODE_ID = `${FLOOR_NODE_PREFIX}${FLOOR_ID}`
export const UPPER_FLOOR_ID = 'u'
export const UPPER_FLOOR_NODE_ID = `${FLOOR_NODE_PREFIX}${UPPER_FLOOR_ID}`
const UPPER_ELEVATION_MM = 3000
const WALL_LENGTH_MM = 2000
const WALL_THICKNESS_MM = 120
const WALL_HEIGHT_MM = 2400

export const groundNode = (): SceneNode => ({
  id: FLOOR_NODE_ID,
  kind: 'floor',
  name: 'Ground',
  elevation: 0,
})

export const upperNode = (): SceneNode => ({
  id: UPPER_FLOOR_NODE_ID,
  kind: 'floor',
  name: 'Upper',
  elevation: UPPER_ELEVATION_MM,
})

function floorWall(floorId: string): SceneGraph['walls'][number] {
  return {
    id: `wall:${floorId}1`,
    kind: 'wall',
    floorId,
    start: { x: 0, y: 0 },
    end: { x: WALL_LENGTH_MM, y: 0 },
    thickness: WALL_THICKNESS_MM,
    height: WALL_HEIGHT_MM,
  }
}

/** A scene graph of the given floor nodes with one wall on each floor named in `floorIds`. */
export function graphOf(nodes: SceneNode[], floorIds: string[]): SceneGraph {
  return {
    nodes,
    walls: floorIds.map(floorWall),
    rooms: [],
    underlays: [],
    openings: [],
    dimensions: [],
    stairs: [],
    furniture: [],
  }
}

export function projectWith(...floors: Floor[]): Project {
  const base = createEmptyProject({
    name: 'Dispose',
    units: 'metric',
    period: 'period',
    appVersion: '0',
  })
  return { ...base, floors }
}

export function groundOf(framed: FramedScene): FramedScene['root']['children'][number] {
  const ground = framed.root.children.find(isGroundPlane)
  if (ground === undefined) {
    throw new Error('expected the framed scene to seat a ground plane')
  }
  return ground
}

export function rightmostRoom(graph: SceneGraph): RoomSceneNode {
  const [first, ...rest] = graph.rooms
  if (first === undefined) {
    throw new Error('expected the partitioned floor to derive rooms')
  }
  const maxX = (room: RoomSceneNode): number => Math.max(...room.polygon.map((point) => point.x))
  return rest.reduce((best, room) => (maxX(room) > maxX(best) ? room : best), first)
}
