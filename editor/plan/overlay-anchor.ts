import { dimensionGeometry, polygonCentroid } from '../../core'
import type {
  DimensionSceneNode,
  OpeningSceneNode,
  Point,
  RoomSceneNode,
  WallSceneNode,
} from '../../core'

export type SelectableSceneNode =
  | WallSceneNode
  | RoomSceneNode
  | OpeningSceneNode
  | DimensionSceneNode

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/** The world-space point the overlay proxy and tooltip anchor to. */
export function entityAnchor(node: SelectableSceneNode): Point {
  switch (node.kind) {
    case 'wall':
      return midpoint(node.start, node.end)
    case 'opening':
      return node.center
    case 'dimension': {
      const geometry = dimensionGeometry(node.start, node.end, node.offset)
      return midpoint(geometry.lineStart, geometry.lineEnd)
    }
    case 'room':
      return polygonCentroid(node.polygon)
  }
}
