import { distance, type Point, type SceneGraph } from '../../core'
import { hitTestWalls } from './hit-test'

/** Scene-node id prefix the scene graph gives wall nodes; the host id strips it. */
const WALL_NODE_PREFIX = 'wall:'

/** The position the projected point clamps to when the wall has zero length. */
const ZERO_LENGTH_POSITION = 0

export interface OpeningPlacement {
  floorId: string
  hostWallId: string
  position: number
}

/** Project `world` onto the wall from `start`, clamped to `[0, length]`. */
function projectOntoWall(start: Point, end: Point, world: Point): number {
  const length = distance(start, end)
  if (length === 0) {
    return ZERO_LENGTH_POSITION
  }
  const alongX = (end.x - start.x) / length
  const alongY = (end.y - start.y) / length
  const raw = (world.x - start.x) * alongX + (world.y - start.y) * alongY
  return Math.max(0, Math.min(raw, length))
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
  const position = projectOntoWall(wall.start, wall.end, world)
  return { floorId: wall.floorId, hostWallId, position }
}
