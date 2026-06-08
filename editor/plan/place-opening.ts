import { distance, WALL_NODE_PREFIX, type Point, type SceneGraph } from '../../core'
import { hitTestWalls } from './hit-test'
import { projectPointOntoWall } from './opening-geometry'

export interface OpeningPlacement {
  floorId: string
  hostWallId: string
  position: number
}

/** The nearest wall within tolerance and the along-wall position under `world`, or null. */
export function placeOpeningTarget(
  scene: SceneGraph,
  world: Point,
  tolerance: number,
): OpeningPlacement | null {
  const hitId = hitTestWalls(scene.walls, world, tolerance)
  if (hitId === null) {
    return null
  }
  const wall = scene.walls.find((candidate) => candidate.id === hitId)
  if (wall === undefined) {
    return null
  }
  const hostWallId = hitId.startsWith(WALL_NODE_PREFIX)
    ? hitId.slice(WALL_NODE_PREFIX.length)
    : hitId
  const length = distance(wall.start, wall.end)
  const position = Math.max(0, Math.min(projectPointOntoWall(wall.start, wall.end, world), length))
  return { floorId: wall.floorId, hostWallId, position }
}
