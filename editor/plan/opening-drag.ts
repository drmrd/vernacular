import { distance, type Point, type Wall } from '../../core'

/** The position to report when the host wall has zero length. */
const ZERO_LENGTH_POSITION = 0

/** The signed along-wall projection of `world` from `start`, without clamping. */
function projectOntoWall(start: Point, end: Point, world: Point): number {
  const length = distance(start, end)
  if (length === 0) {
    return ZERO_LENGTH_POSITION
  }
  const alongX = (end.x - start.x) / length
  const alongY = (end.y - start.y) / length
  return (world.x - start.x) * alongX + (world.y - start.y) * alongY
}

/** The along-wall position (mm from the host wall start) of `world` projected onto the host wall. */
export function openingDragPosition(hostWall: Wall, world: Point): number {
  return projectOntoWall(hostWall.start, hostWall.end, world)
}
