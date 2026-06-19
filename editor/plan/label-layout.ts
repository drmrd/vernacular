import type { Point } from '../../core'

import type { Bounds } from './fit'

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
