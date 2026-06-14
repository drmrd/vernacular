import { builtinElementTypes, type ElementType } from '../registries/element-types'
import { getEntry, type Registry } from '../registries/registry'
import type { OpeningSceneNode } from './scene-graph'

/** Which surface role paints a fill part, distinct from the wall-shell roles. */
export type OpeningFillRole = 'leaf' | 'glass'

/** A closed `[min, max]` extent (mm) along one opening-local axis. */
export interface OpeningFillExtent {
  readonly min: number
  readonly max: number
}

/**
 * One axis-aligned box of an opening's three-dimensional body, authored in the
 * opening local frame (spec section 3.2): origin at the finished-floor line below
 * the opening center, `+x` along the wall, `+y` up, the wall normal across. The
 * box spans `along` in x and `up` in y, with `thickness` across the wall centered
 * on the wall centerline. The engine extrudes each part into a thin box.
 */
export interface OpeningFillPart {
  readonly role: OpeningFillRole
  readonly along: OpeningFillExtent
  readonly up: OpeningFillExtent
  readonly thickness: number
}

/** Uniform reveal gap insetting a door leaf from its void edges (mm). */
export const LEAF_REVEAL_GAP_MM = 10
/** Thickness of a door leaf across the wall (mm). */
export const DOOR_LEAF_THICKNESS_MM = 44
/** Width of a window's perimeter sash band (mm). */
export const SASH_FRAME_WIDTH_MM = 60
/** Thickness of a window's sash bars across the wall (mm). */
export const SASH_FRAME_THICKNESS_MM = 50
/** Thickness of a window's glass pane across the wall (mm). */
export const GLASS_THICKNESS_MM = 6

/**
 * Resolves an opening's three-dimensional body from its element type (spec section
 * 3.1): the fill-kind resolver seam. The geometry comes from the element type's
 * `scene3D.fill`, so a new body is a new `case` here, not a change in the builder
 * that calls it. A node whose type is missing from the registry, or whose type
 * omits `fill`, yields no parts, so a cased opening keeps the empty void the void
 * slice cuts.
 */
export function openingFill(
  node: OpeningSceneNode,
  elementTypes: Registry<ElementType> = builtinElementTypes,
): OpeningFillPart[] {
  const entry = getEntry(elementTypes, node.type)
  switch (entry?.scene3D.fill) {
    case 'door-leaf':
      return doorLeafParts(node)
    // 'window-sash' (the sash frame and glass) and the double-door split land in
    // later cycles, each a new branch here, leaving the seam visible.
    default:
      return []
  }
}

/** One door leaf filling the opening rectangle, inset by the reveal gap on all sides. */
function doorLeafParts(node: OpeningSceneNode): OpeningFillPart[] {
  const halfWidth = node.width / 2
  return [
    {
      role: 'leaf',
      along: { min: -halfWidth + LEAF_REVEAL_GAP_MM, max: halfWidth - LEAF_REVEAL_GAP_MM },
      up: {
        min: node.sillHeight + LEAF_REVEAL_GAP_MM,
        max: node.sillHeight + node.height - LEAF_REVEAL_GAP_MM,
      },
      thickness: DOOR_LEAF_THICKNESS_MM,
    },
  ]
}
