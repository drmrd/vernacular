import { distance, openingFootprint, type OpeningSceneNode, type Point } from '../../core'

/** The four footprint corners of an opening scene node (width along the wall by host thickness across). */
export function openingCorners(node: OpeningSceneNode): Point[] {
  return openingFootprint(node.center, node.along, node.normal, node.width, node.hostThickness)
}

/** Signed scalar projection (millimeters) of `world` onto the wall axis from `start`; unclamped. 0 for a zero-length wall. */
export function projectPointOntoWall(start: Point, end: Point, world: Point): number {
  const length = distance(start, end)
  if (length === 0) return 0
  const alongX = (end.x - start.x) / length
  const alongY = (end.y - start.y) / length
  return (world.x - start.x) * alongX + (world.y - start.y) * alongY
}
