import { nice125AtLeast } from './nice-numbers'
import { axisProjection, axisSamples, type Viewport, type ViewportSize } from './viewport'

export const GRID_MIN_LINE_SPACING_PX = 12

/**
 * Smallest 1-2-5 nice number whose on-screen size (`spacing * scale`) is at
 * least `GRID_MIN_LINE_SPACING_PX`.
 *
 * @param scale viewport zoom in pixels per millimetre (px/mm)
 */
export function gridSpacingMm(scale: number /* px/mm */): number {
  return nice125AtLeast(GRID_MIN_LINE_SPACING_PX / scale)
}

export interface GridLine {
  orientation: 'vertical' | 'horizontal'
  worldValue: number
  screen: number
}

export interface VisibleGrid {
  spacingMm: number
  lines: GridLine[]
}

/**
 * Grid lines of one orientation across a viewport span. Vertical lines hold a
 * constant world x, so they are sampled along the horizontal axis; horizontal
 * lines are sampled along the vertical axis. `lengthPx` is the screen extent the
 * sampling walks (viewport width for verticals, height for horizontals) and
 * `spacingMm` the world step between lines.
 */
function gridLinesAlongAxis(
  viewport: Viewport,
  orientation: GridLine['orientation'],
  span: { lengthPx: number; spacingMm: number },
): GridLine[] {
  const axis = orientation === 'vertical' ? 'horizontal' : 'vertical'
  return axisSamples(axisProjection(viewport, axis), span.lengthPx, span.spacingMm).map(
    (sample): GridLine => ({ orientation, worldValue: sample.worldValue, screen: sample.screen }),
  )
}

export function visibleGridLines(viewport: Viewport, size: ViewportSize): VisibleGrid {
  const spacingMm = gridSpacingMm(viewport.scale)
  const verticals = gridLinesAlongAxis(viewport, 'vertical', { lengthPx: size.width, spacingMm })
  const horizontals = gridLinesAlongAxis(viewport, 'horizontal', {
    lengthPx: size.height,
    spacingMm,
  })
  return { spacingMm, lines: [...verticals, ...horizontals] }
}
