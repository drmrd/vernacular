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

/** The world-space leaf and swing-arc primitives a door symbol strokes for one leaf. */
export interface SwingLeafGeometry {
  /** World-space pivot jamb the leaf rotates about; the arc center. */
  hinge: Point
  /** World-space open leaf tip; the arc start point. */
  leafEnd: Point
  /** World-space closed-jamb target the arc sweeps toward; the arc end point. */
  closed: Point
  /** The canvas `arc` sweep flag, baked for the y-flipped screen projection, that yields the minor (<= 180 degree) arc. */
  counterclockwise: boolean
}

/** Half-extent factor for the jamb offset from the opening center along the wall axis. */
const HALF_WIDTH = 0.5
const TWO_PI = Math.PI * 2

function leafSigns(node: OpeningSceneNode): { hinge: number; facing: number } {
  return {
    hinge: node.orientation.hinge === 'start' ? -1 : 1,
    facing: node.orientation.facing === 'positive' ? 1 : -1,
  }
}

/**
 * The world-space leaf and arc primitives for one swing-door leaf. `hinge` is the
 * pivot jamb, `closed` is the opposite (closed-door) jamb the arc ends at, and
 * `leafEnd` is the open leaf tip on the facing side. The `counterclockwise` flag
 * is computed from world points with the y-axis negated, matching the screen-space
 * angles the plan renderer derives after `worldToScreen` (the ADR-0099 y-up flip),
 * and is chosen so the arc from `leafEnd` to `closed` is the minor (quarter-circle)
 * arc. The default `'primary'` leaf uses leaf-sign +1; `'secondary'` (for a double
 * door's mirrored leaf) pivots from the other jamb with leaf-sign +1 on the same
 * facing side.
 */
export function swingLeafGeometry(
  node: OpeningSceneNode,
  options?: { leaf?: 'primary' | 'secondary' },
): SwingLeafGeometry {
  const leaf = options?.leaf ?? 'primary'
  const signs = leafSigns(node)
  const { center, along, normal, width } = node
  // The secondary leaf of a double door pivots from the opposite jamb, so its
  // pivot sign is the negation of the primary leaf's.
  const pivotSign = leaf === 'primary' ? signs.hinge : -signs.hinge
  const hinge: Point = {
    x: center.x + along.x * pivotSign * width * HALF_WIDTH,
    y: center.y + along.y * pivotSign * width * HALF_WIDTH,
  }
  const closed: Point = {
    x: center.x + along.x * -pivotSign * width * HALF_WIDTH,
    y: center.y + along.y * -pivotSign * width * HALF_WIDTH,
  }
  const leafEnd: Point = {
    x: hinge.x + normal.x * signs.facing * width,
    y: hinge.y + normal.y * signs.facing * width,
  }
  const startAngle = Math.atan2(-(leafEnd.y - hinge.y), leafEnd.x - hinge.x)
  const endAngle = Math.atan2(-(closed.y - hinge.y), closed.x - hinge.x)
  // Normalize the signed angle difference into [0, 2pi): the `% TWO_PI` can yield a
  // negative remainder, so add TWO_PI and take the modulus again to fold it back in.
  const delta = (((endAngle - startAngle) % TWO_PI) + TWO_PI) % TWO_PI
  // A counterclockwise (in this y-flipped frame) sweep > pi covers the major arc;
  // selecting `delta > pi` therefore strokes the minor (<= 180 degree) swing arc.
  const counterclockwise = delta > Math.PI
  return { hinge, leafEnd, closed, counterclockwise }
}
