import type { FurnitureInstance, Point, SceneGraph } from '../../core'
import { DEFAULT_HIT_TOLERANCE_MM, hitTest } from './hit-test'
import { hitTestFurniture } from './hit-test-furniture'
import { hitTestUnderlay } from './hit-test-underlay'

/**
 * The node id a bare click selects, in paint order from the top down: placed
 * furniture, then the graph entities (openings, walls, dimensions, rooms), then a
 * loaded underlay. The underlay sits last so a click on a wall or room drawn over
 * it selects that entity, and only a click on bare underlay selects the image.
 * When `options.dimensionsVisible` is `false`, dimensions are excluded from the
 * graph-entity pass so a click on a hidden dimension falls through to whatever
 * else is beneath it. Returns null when the point lands on nothing selectable.
 */
// eslint-disable-next-line max-params -- options carries the overlay-visibility flag; grouping it with the required args would obscure the click target's paint-order contract
export function planClickTarget(
  graph: SceneGraph,
  furniture: readonly FurnitureInstance[],
  world: Point,
  options?: { dimensionsVisible?: boolean },
): string | null {
  return (
    hitTestFurniture(furniture, world) ??
    hitTest(graph, world, DEFAULT_HIT_TOLERANCE_MM, options) ??
    hitTestUnderlay(graph.underlays, world)
  )
}
