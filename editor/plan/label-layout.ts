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
