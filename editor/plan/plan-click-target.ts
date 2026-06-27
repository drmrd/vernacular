import type { FurnitureInstance, Point, SceneGraph } from '../../core'
import { DEFAULT_HIT_TOLERANCE_MM, hitTest } from './hit-test'
import { hitTestFurniture } from './hit-test-furniture'
import { hitTestUnderlay } from './hit-test-underlay'

/**
 * The node id a bare click selects, in paint order from the top down: placed
 * furniture, then the graph entities (openings, walls, dimensions, rooms), then a
 * loaded underlay. The underlay sits last so a click on a wall or room drawn over
 * it selects that entity, and only a click on bare underlay selects the image.
 * Returns null when the point lands on nothing selectable.
 */
export function planClickTarget(
  graph: SceneGraph,
  furniture: readonly FurnitureInstance[],
  world: Point,
): string | null {
  return (
    hitTestFurniture(furniture, world) ??
    hitTest(graph, world, DEFAULT_HIT_TOLERANCE_MM) ??
    hitTestUnderlay(graph.underlays, world)
  )
}
