import type { DimensionSceneNode } from '../../core'
import type { DrawableDimension } from './draw-dimension'

/**
 * Pair each dimension scene node with its selection state for the redraw. A pure
 * transform mirroring `toDrawableOpenings`; coverage-excluded glue feeding
 * `drawPlan`.
 */
export function toDrawableDimensions(
  dimensions: readonly DimensionSceneNode[],
  selectedIds: ReadonlySet<string>,
): DrawableDimension[] {
  return dimensions.map((node) => ({ node, selected: selectedIds.has(node.id) }))
}
