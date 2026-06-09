import { dimensionGeometry } from '../../core'
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

function polygonCentroid(polygon: readonly Point[]): Point {
  if (polygon.length === 0) {
    return { x: 0, y: 0 }
  }
  const sum = polygon.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), {
    x: 0,
    y: 0,
  })
  return { x: sum.x / polygon.length, y: sum.y / polygon.length }
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
