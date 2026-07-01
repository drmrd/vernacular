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
    case 'door-leaf': {
      const double = entry.opening?.double ?? false
      return doorLeafParts(node, double)
    }
    case 'window-sash':
      return wholeSashParts(node)
    case 'window-sash-hung':
      return hungWindowSashParts(node)
    // A further fill kind (a glazed door, a curved sash) is a new case here, the
    // way a new void shape is a new case in openingVoidContour.
    default:
      return []
  }
}

/**
 * Door leaves filling the opening rectangle, inset by the reveal gap on all sides.
 * A double door splits into two leaves meeting at the center; a single door is one
 * leaf spanning the full inset width.
 */
function doorLeafParts(node: OpeningSceneNode, double: boolean): OpeningFillPart[] {
  const halfWidth = node.width / 2
  const leftEdge = -halfWidth + LEAF_REVEAL_GAP_MM
  const rightEdge = halfWidth - LEAF_REVEAL_GAP_MM
  const up: OpeningFillExtent = {
    min: node.sillHeight + LEAF_REVEAL_GAP_MM,
    max: node.sillHeight + node.height - LEAF_REVEAL_GAP_MM,
  }
  const leaf = (along: OpeningFillExtent): OpeningFillPart => ({
    role: 'leaf',
    along,
    up,
    thickness: DOOR_LEAF_THICKNESS_MM,
  })
  if (double) {
    return [leaf({ min: leftEdge, max: 0 }), leaf({ min: 0, max: rightEdge })]
  }
  return [leaf({ min: leftEdge, max: rightEdge })]
}

/** A single leaf-role bar (a sash frame member or a meeting rail) at frame thickness. */
function leafBar(along: OpeningFillExtent, up: OpeningFillExtent): OpeningFillPart {
  return { role: 'leaf', along, up, thickness: SASH_FRAME_THICKNESS_MM }
}

/**
 * One sash filling a vertical band of the opening: a perimeter of four frame members
 * (a top rail, a bottom rail, and two stiles) ringing one glass pane inset by the
 * frame width. The band is the sash's own `[min, max]` height range, so an undivided
 * sash passes the whole opening and a hung window passes each of its two bands.
 */
function sashAssembly(halfWidth: number, band: OpeningFillExtent): OpeningFillPart[] {
  const frameWidth = SASH_FRAME_WIDTH_MM
  const innerUp: OpeningFillExtent = { min: band.min + frameWidth, max: band.max - frameWidth }
  const span: OpeningFillExtent = { min: -halfWidth, max: halfWidth }
  return [
    leafBar(span, { min: band.max - frameWidth, max: band.max }),
    leafBar(span, { min: band.min, max: band.min + frameWidth }),
    leafBar({ min: -halfWidth, max: -halfWidth + frameWidth }, innerUp),
    leafBar({ min: halfWidth - frameWidth, max: halfWidth }, innerUp),
    {
      role: 'glass',
      along: { min: -halfWidth + frameWidth, max: halfWidth - frameWidth },
      up: innerUp,
      thickness: GLASS_THICKNESS_MM,
    },
  ]
}

/** An undivided sash window: one sash spanning the whole opening. */
function wholeSashParts(node: OpeningSceneNode): OpeningFillPart[] {
  return sashAssembly(node.width / 2, { min: node.sillHeight, max: node.sillHeight + node.height })
}

/**
 * A hung window as two stacked sashes: a lower and an upper sash meeting at a
 * full-width meeting rail that straddles the opening's vertical midpoint. Each sash
 * fills its own band, so the window reads as two panes rather than one.
 */
function hungWindowSashParts(node: OpeningSceneNode): OpeningFillPart[] {
  const halfWidth = node.width / 2
  const sill = node.sillHeight
  const top = sill + node.height
  const mid = sill + node.height / 2
  const railHalf = SASH_FRAME_WIDTH_MM / 2
  const railBottom = mid - railHalf
  const railTop = mid + railHalf
  const meetingRail = leafBar(
    { min: -halfWidth, max: halfWidth },
    { min: railBottom, max: railTop },
  )
  return [
    ...sashAssembly(halfWidth, { min: sill, max: railBottom }),
    meetingRail,
    ...sashAssembly(halfWidth, { min: railTop, max: top }),
  ]
}
