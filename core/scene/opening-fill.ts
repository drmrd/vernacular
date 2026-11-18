import { builtinElementTypes, type ElementType } from '../registries/element-types'
import { getEntry, type Registry } from '../registries/registry'
import type { OpeningSceneNode } from './scene-graph'

/** One of the two sashes of a hung window. */
export type HungSash = 'lower' | 'upper'

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
 * on the wall centerline unless `acrossOffset` says otherwise. The engine extrudes
 * each part into a thin box.
 */
export interface OpeningFillPart {
  readonly role: OpeningFillRole
  readonly along: OpeningFillExtent
  readonly up: OpeningFillExtent
  readonly thickness: number
  /**
   * Whether this part is fixed shut rather than operable, e.g. a single-hung window's upper
   * sash. Omitted (not `false`) when the part is operable or operability does not apply.
   */
  readonly fixed?: boolean
  /**
   * The sash of a hung window this part belongs to. Every part of a hung-window fill carries
   * it; the meeting rail belongs to the lower sash. Omitted for every other fill.
   */
  readonly sash?: HungSash
  /**
   * Where the box's center sits across the wall (mm), from the centerline along the opening's
   * normal; omitted (not 0) means centered. A hung window's lower sash takes half its sash
   * depth (HUNG_SASH_TRACK_OFFSET_MM, 25 mm, in a wall of 100 mm or more; less in a thinner
   * wall) times the sign of the room side (+1 'positive', -1 'negative'), the upper sash the
   * opposite. The room side is the node's `roomSide`; `facing` decides only when the node has none.
   */
  readonly acrossOffset?: number
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
 * How far each hung-window sash's track sits from the wall centerline (mm) in a wall of 100 mm
 * or more: half the bar thickness, so the two 50 mm sashes sit side by side across the wall and
 * never share a plane. Kept as a named expectation for tests; the code computes the offset from
 * the sash depth (see `hungSashDepth`). A thinner wall thins the sashes and moves the tracks in,
 * see `HUNG_SASH_MIN_DEPTH_MM`.
 */
export const HUNG_SASH_TRACK_OFFSET_MM = SASH_FRAME_THICKNESS_MM / 2
/**
 * The thinnest a hung-window sash is built across the wall (mm). It keeps each 6 mm glass pane
 * inside its own bars and the two panes at least 14 mm apart, however thin the wall.
 */
export const HUNG_SASH_MIN_DEPTH_MM = 20

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
      return hungWindowSashParts(node, entry.opening?.fixedSash)
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
 * One sash filling a vertical band of the opening: a perimeter of frame members
 * ringing one glass pane. The band is the sash's own `[min, max]` height range, so
 * an undivided sash passes the whole opening and a hung window passes each of its
 * two bands. Dispatches on `fixed` because a fixed sash (a single-hung window's
 * upper sash) has a structurally different frame from an operable one.
 */
function sashAssembly(
  halfWidth: number,
  band: OpeningFillExtent,
  fixed = false,
): OpeningFillPart[] {
  return fixed ? fixedSashParts(halfWidth, band) : operableSashParts(halfWidth, band)
}

/** The head and bottom rails common to every sash, fixed or operable. */
function sashRails(
  span: OpeningFillExtent,
  band: OpeningFillExtent,
  frameWidth: number,
): readonly [headRail: OpeningFillPart, bottomRail: OpeningFillPart] {
  return [
    leafBar(span, { min: band.max - frameWidth, max: band.max }),
    leafBar(span, { min: band.min, max: band.min + frameWidth }),
  ]
}

/**
 * A fixed sash has no operable inner frame: its glass sets straight into the
 * window's outer jambs at the full `along` width, marked `fixed: true`.
 */
function fixedSashParts(halfWidth: number, band: OpeningFillExtent): OpeningFillPart[] {
  const frameWidth = SASH_FRAME_WIDTH_MM
  const span: OpeningFillExtent = { min: -halfWidth, max: halfWidth }
  const innerUp: OpeningFillExtent = { min: band.min + frameWidth, max: band.max - frameWidth }
  const [headRail, bottomRail] = sashRails(span, band, frameWidth)
  const glass: OpeningFillPart = {
    role: 'glass',
    along: span,
    up: innerUp,
    thickness: GLASS_THICKNESS_MM,
    fixed: true,
  }
  return [headRail, bottomRail, glass]
}

/**
 * An operable sash rings its glass with two named stiles plus the head and bottom
 * rails, all inset by the frame width, so the glass never touches the outer jambs.
 */
function operableSashParts(halfWidth: number, band: OpeningFillExtent): OpeningFillPart[] {
  const frameWidth = SASH_FRAME_WIDTH_MM
  const span: OpeningFillExtent = { min: -halfWidth, max: halfWidth }
  const innerUp: OpeningFillExtent = { min: band.min + frameWidth, max: band.max - frameWidth }
  const [headRail, bottomRail] = sashRails(span, band, frameWidth)
  const leftStile = leafBar({ min: -halfWidth, max: -halfWidth + frameWidth }, innerUp)
  const rightStile = leafBar({ min: halfWidth - frameWidth, max: halfWidth }, innerUp)
  const glass: OpeningFillPart = {
    role: 'glass',
    along: { min: -halfWidth + frameWidth, max: halfWidth - frameWidth },
    up: innerUp,
    thickness: GLASS_THICKNESS_MM,
  }
  return [headRail, bottomRail, leftStile, rightStile, glass]
}

/** An undivided sash window: one sash spanning the whole opening. */
function wholeSashParts(node: OpeningSceneNode): OpeningFillPart[] {
  return sashAssembly(node.width / 2, { min: node.sillHeight, max: node.sillHeight + node.height })
}

/** Where one hung sash stands across the wall: its center offset and the depth of its bars. */
interface SashTrack {
  readonly acrossOffset: number
  readonly depth: number
}

/**
 * Puts a list of parts on one sash's track: names the sash, sets its offset across the wall, and
 * sets the depth of its bars. Glass keeps its own thickness.
 */
function onTrack(
  parts: readonly OpeningFillPart[],
  sash: HungSash,
  track: SashTrack,
): OpeningFillPart[] {
  return parts.map((part) => ({
    ...part,
    sash,
    acrossOffset: track.acrossOffset,
    ...(part.role === 'leaf' ? { thickness: track.depth } : {}),
  }))
}

/**
 * The depth of a hung-window sash's bars across a wall `hostThickness` mm thick (mm). The two
 * sashes sit side by side across the wall, so each gets at most half of it, or the pair would
 * stand proud of the wall faces; a full 50 mm sash would, in any wall under 100 mm. A wall of 40
 * mm or more takes half its thickness, so both sashes stay flush with or inside its faces. Below
 * 40 mm the depth holds at `HUNG_SASH_MIN_DEPTH_MM`, the least that keeps each glass pane inside
 * its bars, and the pair stands proud of the faces, as a door leaf does in a wall thinner than
 * itself. A wall of 100 mm or more keeps the full `SASH_FRAME_THICKNESS_MM`.
 */
function hungSashDepth(hostThickness: number): number {
  return Math.min(SASH_FRAME_THICKNESS_MM, Math.max(HUNG_SASH_MIN_DEPTH_MM, hostThickness / 2))
}

/**
 * A hung window as two stacked sashes: a lower and an upper sash meeting at a
 * full-width meeting rail that straddles the opening's vertical midpoint. Each sash
 * fills its own band, so the window reads as two panes rather than one. `fixedSash`
 * names the sash that is fixed shut (a single-hung window's upper sash); a
 * double-hung window passes no `fixedSash`, so both sashes stay operable. The two
 * sashes sit on separate tracks across the wall, the lower one on the room side of the
 * wall (as in a real hung window), which is the opening's `roomSide` when the node has
 * one and its `facing` side otherwise; the meeting rail belongs to the lower sash. In a wall
 * thinner than 100 mm the sashes are thinner than 50 mm so that they stay inside the wall faces
 * (see `hungSashDepth`), and each track sits half a sash depth from the centerline.
 */
function hungWindowSashParts(node: OpeningSceneNode, fixedSash?: HungSash): OpeningFillPart[] {
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
  const depth = hungSashDepth(node.hostThickness)
  const lowerSide = node.roomSide ?? node.orientation.facing
  const lowerOffset = lowerSide === 'negative' ? -depth / 2 : depth / 2
  const lowerSash = [
    ...sashAssembly(halfWidth, { min: sill, max: railBottom }, fixedSash === 'lower'),
    meetingRail,
  ]
  const upperSash = sashAssembly(halfWidth, { min: railTop, max: top }, fixedSash === 'upper')
  return [
    ...onTrack(lowerSash, 'lower', { acrossOffset: lowerOffset, depth }),
    ...onTrack(upperSash, 'upper', { acrossOffset: -lowerOffset, depth }),
  ]
}
