import { builtinElementTypes, type ElementType } from '../registries/element-types'
import { getEntry, type Registry } from '../registries/registry'
import type { Contour } from './contour'
import type { OpeningSceneNode } from './scene-graph'

/**
 * Authors an opening's void as a rectangular contour in the opening local frame
 * (foundation spec section 3.2): origin at the finished-floor line below the
 * opening center, `+x` along the wall, `+y` up. The rectangle spans `x` in
 * `[-width/2, width/2]` and `y` in `[sillHeight, sillHeight + height]`, emitted
 * as four line segments that close back to the start. It is wound as a hole, so
 * the engine's polygon builder subtracts it. Arc-topped shapes are a later
 * generator; this one emits line segments only.
 */
export function rectangularVoidContour(node: OpeningSceneNode): Contour {
  const halfWidth = node.width / 2
  const topY = node.sillHeight + node.height
  return {
    start: { x: -halfWidth, y: node.sillHeight },
    segments: [
      { kind: 'line', to: { x: -halfWidth, y: topY } },
      { kind: 'line', to: { x: halfWidth, y: topY } },
      { kind: 'line', to: { x: halfWidth, y: node.sillHeight } },
      { kind: 'line', to: { x: -halfWidth, y: node.sillHeight } },
    ],
  }
}

/**
 * Resolves an opening's wall-cut void contour from its element type (foundation
 * spec section 3.1): this is the void-shape resolver seam. The geometry comes
 * from the element type's `scene3D.voidContour`, so adding a new shape is a new
 * `case` here, not a change in the wall builder that calls this. A node whose
 * type is missing from the registry, or whose type omits a `voidContour`, falls
 * back to a rectangle so a misconfigured registry still cuts a plausible void.
 */
export function openingVoidContour(
  node: OpeningSceneNode,
  elementTypes: Registry<ElementType> = builtinElementTypes,
): Contour {
  const entry = getEntry(elementTypes, node.type)
  switch (entry?.scene3D.voidContour) {
    // Add a `case` per VoidContourKind as new void shapes land (foundation spec
    // 3.1). The default cuts a rectangle for the current kind and for any
    // missing or unrecognized kind, so a misconfigured registry still cuts a
    // plausible void.
    default:
      return rectangularVoidContour(node)
  }
}
