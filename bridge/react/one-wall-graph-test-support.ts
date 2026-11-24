import type { SceneGraph, SceneNode } from '../../core'
import { emptySceneGraph } from '../../core/scene/scene-graph-test-fixtures'

export const ONE_WALL_LENGTH_MM = 2000
export const ONE_WALL_THICKNESS_MM = 120
export const ONE_WALL_HEIGHT_MM = 2400

const FLOOR_NODE_PREFIX = 'floor:'

/** The ground floor node every one-wall fixture stands on unless a test passes its own. */
export const groundFloorNode = (): SceneNode => ({
  id: 'floor:g',
  kind: 'floor',
  name: 'Ground',
  elevation: 0,
})

/** A scene graph holding only the ground floor node: no walls, rooms, or furniture. */
export const groundFloorGraph = (): SceneGraph => ({
  ...emptySceneGraph(),
  nodes: [groundFloorNode()],
})

interface OneWallOptions {
  /** The wall's node id; defaults to `wall:<floorId>1`. */
  id?: string
  length?: number
}

/**
 * A one-floor, one-wall graph on the given floor node. Passing the same floor node object
 * models an unchanged floor; a fresh object models an edit.
 */
export function oneWallGraph(
  floorNode: SceneNode = groundFloorNode(),
  { id, length = ONE_WALL_LENGTH_MM }: OneWallOptions = {},
): SceneGraph {
  const floorId = floorNode.id.slice(FLOOR_NODE_PREFIX.length)
  return {
    ...emptySceneGraph(),
    nodes: [floorNode],
    walls: [
      {
        id: id ?? `wall:${floorId}1`,
        kind: 'wall',
        floorId,
        start: { x: 0, y: 0 },
        end: { x: length, y: 0 },
        thickness: ONE_WALL_THICKNESS_MM,
        height: ONE_WALL_HEIGHT_MM,
      },
    ],
  }
}
