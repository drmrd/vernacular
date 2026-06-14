import {
  distance,
  openingFootprint,
  OPENING_NODE_PREFIX,
  type OpeningSceneNode,
  type Point,
} from '../../core'

/** The raw opening id (without the scene-node namespace) the opening commands take. */
export function rawOpeningId(node: OpeningSceneNode): string {
  return node.id.slice(OPENING_NODE_PREFIX.length)
}

/** The four footprint corners of an opening scene node (width along the wall by host thickness across). */
export function openingCorners(node: OpeningSceneNode): Point[] {
  return openingFootprint(node.center, node.along, node.normal, node.width, node.hostThickness)
}

/** The opening's two jamb points on the wall centerline: start at `center - along * width/2`, end at `center + along * width/2`. */
export function openingJambs(node: OpeningSceneNode): { start: Point; end: Point } {
  const halfWidth = node.width / 2
  const { center, along } = node
  return {
    start: { x: center.x - along.x * halfWidth, y: center.y - along.y * halfWidth },
    end: { x: center.x + along.x * halfWidth, y: center.y + along.y * halfWidth },
  }
}

/** Signed scalar projection (millimeters) of `world` onto the wall axis from `start`; unclamped. 0 for a zero-length wall. */
export function projectPointOntoWall(start: Point, end: Point, world: Point): number {
  const length = distance(start, end)
  if (length === 0) return 0
  const alongX = (end.x - start.x) / length
  const alongY = (end.y - start.y) / length
  return (world.x - start.x) * alongX + (world.y - start.y) * alongY
}
