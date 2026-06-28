import type { Point } from '../model/types'
import {
  builtinElementTypes,
  type ElementType,
  type VoidContourKind,
} from '../registries/element-types'
import { getEntry, type Registry } from '../registries/registry'
import type { Contour, ContourSegment } from './contour'
import { openingHeadArcs, type OpeningHeadArc } from './opening-head'
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

/** Full turn in radians; an arc's sweep direction is read by folding angles into one turn around its center. */
const FULL_TURN = Math.PI * 2

/** Two head points coincide within this tolerance when they share a jamb spring or the apex. */
const SAME_POINT_EPSILON = 1e-9

/** Lifts a head point from the springline-origin head frame into the void frame, where the springline sits at `springY`. */
function liftToVoid(point: Point, springY: number): Point {
  return { x: point.x, y: point.y + springY }
}

/** Whether two points coincide within {@link SAME_POINT_EPSILON}. */
function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < SAME_POINT_EPSILON && Math.abs(a.y - b.y) < SAME_POINT_EPSILON
}

/** A curved head shape: every {@link VoidContourKind} except the flat-headed rectangle, which has no head arcs. */
type CurvedVoidContourKind = Exclude<VoidContourKind, 'rectangular'>

/** The peak rise the head reaches above the springline: the highest point of any of its arcs. */
function headRise(arcs: OpeningHeadArc[]): number {
  return Math.max(...arcs.flatMap((arc) => [arc.from.y, arc.to.y, arc.crown.y]))
}

/**
 * Whether the head arc from `from` to `to` passing through `crown` sweeps
 * clockwise (decreasing angle) about its center, in the y-up opening frame. The
 * sweep is clockwise when the crown does not lie within the counter-clockwise
 * span from `from` to `to`. Translation-invariant, so the local head frame and
 * the lifted void frame agree.
 */
function arcSweepsClockwise(arc: OpeningHeadArc): boolean {
  const angleFromCenter = (point: Point): number =>
    Math.atan2(point.y - arc.center.y, point.x - arc.center.x)
  const fold = (radians: number): number => ((radians % FULL_TURN) + FULL_TURN) % FULL_TURN
  const start = angleFromCenter(arc.from)
  const toDelta = fold(angleFromCenter(arc.to) - start)
  const crownDelta = fold(angleFromCenter(arc.crown) - start)
  return crownDelta > toDelta
}

/**
 * Traces the head left to right from the left jamb spring, emitting each head arc
 * as a void-frame arc segment that ends at the next connection point. An arc met
 * at its `to` end is walked in reverse (its sweep direction flips), so a two-arc
 * pointed head reads left jamb, apex, right jamb in one unbroken chain.
 */
function headArcSegments(
  arcs: OpeningHeadArc[],
  halfWidth: number,
  springY: number,
): ContourSegment[] {
  const segments: ContourSegment[] = []
  const remaining = [...arcs]
  let current: Point = { x: -halfWidth, y: 0 }
  while (remaining.length > 0) {
    const arcIndex = remaining.findIndex(
      (arc) => samePoint(arc.from, current) || samePoint(arc.to, current),
    )
    if (arcIndex < 0) break
    const [arc] = remaining.splice(arcIndex, 1)
    // Narrowing guard only: splice returns one element because arcIndex >= 0.
    if (arc === undefined) break
    const reversed = samePoint(arc.to, current)
    const end = reversed ? arc.from : arc.to
    const clockwise = arcSweepsClockwise(arc)
    segments.push({
      kind: 'arc',
      to: liftToVoid(end, springY),
      center: liftToVoid(arc.center, springY),
      clockwise: reversed ? !clockwise : clockwise,
    })
    current = end
  }
  return segments
}

/**
 * Authors a curved-head opening's void: the jambs and sill of
 * {@link rectangularVoidContour}, but with the flat head replaced by the arc
 * segments the head shape resolves to. The jambs rise to the springline, where
 * the head springs and arcs up to its crown at the opening top. The arc math is
 * shared with the 2D head drawing through {@link openingHeadArcs}, so the 3D void
 * and the plan symbol describe one curve.
 */
function curvedVoidContour(node: OpeningSceneNode, shape: CurvedVoidContourKind): Contour {
  const halfWidth = node.width / 2
  const topY = node.sillHeight + node.height
  const arcs = openingHeadArcs(shape, node.width)
  const springY = topY - headRise(arcs)
  return {
    start: { x: -halfWidth, y: node.sillHeight },
    segments: [
      { kind: 'line', to: { x: -halfWidth, y: springY } },
      ...headArcSegments(arcs, halfWidth, springY),
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
  const shape = entry?.scene3D.voidContour
  switch (shape) {
    case 'round':
    case 'arched':
    case 'lancet':
      // The curved heads share one arc generator; their springline and crown come
      // from the head shape's rise (foundation spec 3.1).
      return curvedVoidContour(node, shape)
    // The default cuts a rectangle for the rectangular kind and for any missing or
    // unrecognized kind, so a misconfigured registry still cuts a plausible void.
    default:
      return rectangularVoidContour(node)
  }
}
