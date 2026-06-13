import type { Point, SceneGraph } from '../../core'
import { hitTest } from './hit-test'

/**
 * The entity a Select-mode hover should highlight, or null for no highlight.
 * Delegates the pick to `hitTest`, then suppresses the highlight when the hovered
 * entity is already selected so hover never doubles up on an existing selection.
 */
// eslint-disable-next-line max-params -- the graph, the point, the tolerance, and the current selection are the minimal inputs to decide a Select-mode hover highlight
export function hoverTarget(
  graph: SceneGraph,
  point: Point,
  tolerance: number,
  selectedIds: ReadonlySet<string>,
): string | null {
  const pick = hitTest(graph, point, tolerance)
  if (pick === null || selectedIds.has(pick)) {
    return null
  }
  return pick
}
