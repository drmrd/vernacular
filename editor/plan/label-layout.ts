import {
  dimensionGeometry,
  formatAdaptiveLength,
  polygonCentroid,
  type DimensionSceneNode,
  type Point,
  type RoomSceneNode,
  type UnitPreferences,
} from '../../core'

import type { Bounds } from './fit'
import { midpoint } from './geometry'
import { LABEL_FONT_SIZE_PX, LABEL_LINE_HEIGHT_PX } from './label-constants'
import {
  roomLabelContent,
  roomLabelPlacement,
  type RoomLabelOptions,
  type RoomLabelPlacement,
} from './room-label'
import { worldToScreen, type Viewport } from './viewport'

/**
 * Average glyph advance as a fraction of the font's pixel size for the canvas
 * label face (12px sans-serif). A deterministic stand-in for canvas
 * `measureText`, which is absent from the drawing-context fake and varies across
 * platforms. Estimating width from this constant keeps label placement a pure
 * function of its inputs.
 */
const AVERAGE_GLYPH_ADVANCE_RATIO = 0.55

/**
 * Estimate the axis-aligned on-screen box a label occupies, centered on
 * `anchor` (center/middle alignment). Width is estimated deterministically from
 * `text` and `font.sizePx` via an average-glyph-advance model, not from a canvas
 * `measureText`, so the box is a pure function of its inputs.
 */
export function labelBox(text: string, anchor: Point, font: { sizePx: number }): Bounds {
  const width = AVERAGE_GLYPH_ADVANCE_RATIO * font.sizePx * text.length
  const height = font.sizePx
  const halfWidth = width / 2
  const halfHeight = height / 2
  return {
    min: { x: anchor.x - halfWidth, y: anchor.y - halfHeight },
    max: { x: anchor.x + halfWidth, y: anchor.y + halfHeight },
  }
}

/**
 * Whether two label boxes share positive on-screen area. Strict comparison: two
 * rects that touch only along a shared boundary edge (zero-area, line contact)
 * do not overlap, so a declutter pass leaves edge-adjacent labels alone. This is
 * deliberately not the spatial index's `boundsIntersect` (spatial-index.ts),
 * whose inclusive `<=`/`>=` comparisons count edge-touch as intersection for
 * broad-phase query correctness; here a strict positive-area policy is required.
 */
export function labelsOverlap(a: Bounds, b: Bounds): boolean {
  return a.min.x < b.max.x && b.min.x < a.max.x && a.min.y < b.max.y && b.min.y < a.max.y
}

/**
 * One step of the de-confliction nudge, in pixels. Two colliding labels are
 * separated by repeated steps along the vector between their box centers until
 * their boxes are disjoint, so the step is the placement loop's resolution.
 */
const NUDGE_STEP_PX = 2

/**
 * Half a nudge step. Each step moves both boxes by this amount in opposite
 * directions, so the pair separates by a full `NUDGE_STEP_PX` per iteration while
 * staying centered on their midpoint.
 */
const HALF_NUDGE_PX = NUDGE_STEP_PX / 2

/**
 * The maximum number of nudge steps applied to a colliding pair before the loop
 * gives up. A generous ceiling that the bounded label sizes never reach; it only
 * guards against a non-terminating loop.
 */
const MAX_NUDGE_STEPS = 1000

/**
 * A room's resolved on-screen label: which lines it shows (`kind`) and the final,
 * de-conflicted box (`box`). `box` is the same `{ min, max }` shape as `labelBox`,
 * so it feeds straight into `labelsOverlap`.
 */
export interface RoomLabelLayout {
  roomId: string
  kind: RoomLabelPlacement['kind']
  box: Bounds
}

/**
 * The visible label lines a placement paints for a room, in paint order (name
 * then area). Callers must not assume widest-first; `widestLine` extracts the
 * widest line independently for box sizing.
 */
function visibleLines(
  room: RoomSceneNode,
  placement: RoomLabelPlacement,
  options: RoomLabelOptions,
): string[] {
  const content = roomLabelContent(room, options)
  const lines: string[] = []
  if (placement.showName && content.name !== undefined) {
    lines.push(content.name)
  }
  if (placement.showArea) {
    lines.push(content.area)
  }
  return lines
}

/** The widest of the given label lines, used to size a label's box. */
function widestLine(lines: string[]): string {
  return lines.reduce((widest, line) => (line.length > widest.length ? line : widest), '')
}

/** The box `lines` occupy when painted centered on `anchor`, before de-confliction. */
function projectedLabelBox(lines: string[], anchor: Point): Bounds {
  const box = labelBox(widestLine(lines), anchor, { sizePx: LABEL_FONT_SIZE_PX })
  // A two-line block is taller than a single font line, so grow the box by one
  // line-height for the area line. The growth is symmetric about the anchor so
  // the box stays centered on the projected centroid, matching how the draw path
  // anchors the block.
  if (lines.length > 1) {
    const halfGrowth = LABEL_LINE_HEIGHT_PX / 2
    return {
      min: { x: box.min.x, y: box.min.y - halfGrowth },
      max: { x: box.max.x, y: box.max.y + halfGrowth },
    }
  }
  return box
}

/** The center point of a box. */
function centerOf(box: Bounds): Point {
  return { x: (box.min.x + box.max.x) / 2, y: (box.min.y + box.max.y) / 2 }
}

/** Translate a box by a screen-pixel delta. */
function translateBox(box: Bounds, delta: Point): Bounds {
  return {
    min: { x: box.min.x + delta.x, y: box.min.y + delta.y },
    max: { x: box.max.x + delta.x, y: box.max.y + delta.y },
  }
}

/** A unit vector from `from` to `to`, deterministically defaulting to +x for coincident centers. */
function separationDirection(from: Point, to: Point): Point {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy)
  if (length === 0) {
    return { x: 1, y: 0 }
  }
  return { x: dx / length, y: dy / length }
}

/** Push two colliding boxes symmetrically apart along the vector between their centers until disjoint. */
function separate(a: Bounds, b: Bounds): { a: Bounds; b: Bounds } {
  let resolvedA = a
  let resolvedB = b
  for (let step = 0; step < MAX_NUDGE_STEPS && labelsOverlap(resolvedA, resolvedB); step += 1) {
    const direction = separationDirection(centerOf(resolvedA), centerOf(resolvedB))
    resolvedA = translateBox(resolvedA, {
      x: -direction.x * HALF_NUDGE_PX,
      y: -direction.y * HALF_NUDGE_PX,
    })
    resolvedB = translateBox(resolvedB, {
      x: direction.x * HALF_NUDGE_PX,
      y: direction.y * HALF_NUDGE_PX,
    })
  }
  return { a: resolvedA, b: resolvedB }
}

/**
 * Lay out every room's label, de-conflicting overlapping visible boxes so no two
 * intersect. Each room is projected to its centroid and sized by its placement;
 * hidden rooms keep a degenerate box and take no part in de-confliction. Visible
 * boxes that collide are nudged symmetrically apart along the vector between their
 * centers (the NUDGE policy) so both stay visible; already-disjoint labels are
 * returned at their projected centroid, unchanged. The pass is a pure,
 * deterministic function of its inputs.
 */
export function layoutRoomLabels(
  rooms: RoomSceneNode[],
  viewport: Viewport,
  options: RoomLabelOptions,
): RoomLabelLayout[] {
  const layout: RoomLabelLayout[] = rooms.map((room) => {
    const placement = roomLabelPlacement(room, viewport, options)
    const lines = visibleLines(room, placement, options)
    const anchor = worldToScreen(polygonCentroid(room.polygon), viewport)
    return {
      roomId: room.id,
      kind: placement.kind,
      box: projectedLabelBox(lines, anchor),
    }
  })

  for (let i = 0; i < layout.length; i += 1) {
    for (let j = i + 1; j < layout.length; j += 1) {
      const first = layout[i]
      const second = layout[j]
      if (first === undefined || second === undefined) {
        continue
      }
      if (first.kind === 'hidden' || second.kind === 'hidden') {
        continue
      }
      if (!labelsOverlap(first.box, second.box)) {
        continue
      }
      const separated = separate(first.box, second.box)
      first.box = separated.a
      second.box = separated.b
    }
  }

  return layout
}

/**
 * A dimension's resolved on-screen label: the final, de-conflicted box. `box` is
 * the same `{ min, max }` shape as `labelBox`, so it feeds straight into
 * `labelsOverlap`.
 */
export interface DimensionLabelLayout {
  dimensionId: string
  box: Bounds
}

/** Options the dimension layout pass needs to format each measured length. */
export interface DimensionLayoutOptions {
  preferences: UnitPreferences
}

/** The screen anchor a dimension's measured-length label centers on: the midpoint of its projected offset line, matching the draw path. */
function dimensionLabelAnchor(node: DimensionSceneNode, viewport: Viewport): Point {
  const geometry = dimensionGeometry(node.start, node.end, node.offset)
  return worldToScreen(midpoint(geometry.lineStart, geometry.lineEnd), viewport)
}

/**
 * Lay out every dimension's measured-length label, de-conflicting overlapping
 * boxes so no two intersect. Each dimension is anchored at the midpoint of its
 * projected offset line and sized by its formatted length, matching today's draw
 * path. Two parallel dimensions whose midpoint boxes collide are nudged
 * symmetrically apart along the vector between their centers (which for parallel
 * offset lines is the perpendicular/offset direction) until disjoint, so both
 * stay visible; a lone dimension keeps its midpoint placement. The pass is a
 * pure, deterministic function of its inputs.
 */
export function layoutDimensionLabels(
  dimensions: DimensionSceneNode[],
  viewport: Viewport,
  options: DimensionLayoutOptions,
): DimensionLabelLayout[] {
  const layout: DimensionLabelLayout[] = dimensions.map((node) => {
    const text = formatAdaptiveLength(node.length, options.preferences)
    const anchor = dimensionLabelAnchor(node, viewport)
    return {
      dimensionId: node.id,
      box: labelBox(text, anchor, { sizePx: LABEL_FONT_SIZE_PX }),
    }
  })

  for (let i = 0; i < layout.length; i += 1) {
    for (let j = i + 1; j < layout.length; j += 1) {
      const first = layout[i]
      const second = layout[j]
      if (first === undefined || second === undefined) {
        continue
      }
      if (!labelsOverlap(first.box, second.box)) {
        continue
      }
      const separated = separate(first.box, second.box)
      first.box = separated.a
      second.box = separated.b
    }
  }

  return layout
}
