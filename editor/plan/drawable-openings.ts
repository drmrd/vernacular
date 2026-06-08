import { builtinElementTypes, getEntry, type OpeningSceneNode } from '../../core'
import type { DrawableOpening } from './draw-opening'

// The plan symbol a node falls back to when its element type is missing from the
// registry; a cased opening draws only the gap and jamb caps, the safe default.
const FALLBACK_SYMBOL = 'cased-opening'

/**
 * Pair each opening scene node with the render decisions resolved from its
 * element type and the current selection. The symbol and the double flag come
 * from the `builtinElementTypes` entry (with a cased-opening / single-leaf
 * fallback when the type is unknown), and `selected` reflects the selection set.
 * Coverage-excluded glue feeding `drawPlan`.
 */
export function toDrawableOpenings(
  openings: readonly OpeningSceneNode[],
  selectedIds: ReadonlySet<string>,
): DrawableOpening[] {
  return openings.map((node) => {
    const type = getEntry(builtinElementTypes, node.type)
    return {
      node,
      symbol: type?.plan2D.symbol ?? FALLBACK_SYMBOL,
      double: type?.opening?.double ?? false,
      selected: selectedIds.has(node.id),
    }
  })
}
