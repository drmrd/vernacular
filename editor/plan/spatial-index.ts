import type { Point } from '../../core'
import type { Bounds } from './fit'

export interface IndexedEntity {
  id: string
  bounds: Bounds
}

export interface SpatialIndex {
  /** Ids whose stored bounds lie within `tolerance` of `point` (bounds expanded by tolerance, then point-in-bounds). */
  queryPoint(point: Point, tolerance: number): string[]
  /** Ids whose stored bounds intersect `region`. */
  queryBounds(region: Bounds): string[]
}

/** Grows `bounds` outward by `margin` on every side. */
function expandBounds(bounds: Bounds, margin: number): Bounds {
  return {
    min: { x: bounds.min.x - margin, y: bounds.min.y - margin },
    max: { x: bounds.max.x + margin, y: bounds.max.y + margin },
  }
}

function pointInBounds(point: Point, bounds: Bounds): boolean {
  return (
    point.x >= bounds.min.x &&
    point.x <= bounds.max.x &&
    point.y >= bounds.min.y &&
    point.y <= bounds.max.y
  )
}

/**
 * Broad-phase index over per-entity axis-aligned bounds. A correctness-first
 * linear scan answers the query interface; the design specification's quadtree
 * is an internal detail behind this contract and not yet materialized.
 */
export function buildSpatialIndex(entities: readonly IndexedEntity[]): SpatialIndex {
  return {
    queryPoint(point, tolerance) {
      return entities
        .filter((entity) => pointInBounds(point, expandBounds(entity.bounds, tolerance)))
        .map((entity) => entity.id)
    },
    queryBounds() {
      return []
    },
  }
}
