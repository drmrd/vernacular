import { axisProjection, axisSamples, type Viewport, type ViewportSize } from './viewport'

export const GRID_MIN_LINE_SPACING_PX = 12

/** Base of the decade the spacing snaps to; also the rollover step when the gap exceeds the 1-2-5 ratios. */
const DECADE_BASE = 10
/** The "5" rung of the 1-2-5 sequence; named so the multiplier table reads without a bare literal. */
const HALF_DECADE = 5
/** The 1-2-5 nice-number ratios within one decade, ascending. Gaps past the largest ratio roll over to the next decade via the `?? DECADE_BASE` fallback below. */
const NICE_MULTIPLIERS = [1, 2, HALF_DECADE] as const

/**
 * Smallest 1-2-5 nice number whose on-screen size (`spacing * scale`) is at
 * least `GRID_MIN_LINE_SPACING_PX`.
 *
 * @param scale viewport zoom in pixels per millimetre (px/mm)
 */
export function gridSpacingMm(scale: number /* px/mm */): number {
  const minWorld = GRID_MIN_LINE_SPACING_PX / scale
  const magnitude = DECADE_BASE ** Math.floor(Math.log10(minWorld))
  const normalized = minWorld / magnitude // in [1, 10)
  const niceMultiplier = NICE_MULTIPLIERS.find((step) => normalized <= step) ?? DECADE_BASE
  return niceMultiplier * magnitude
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

export function visibleGridLines(viewport: Viewport, size: ViewportSize): VisibleGrid {
  const spacingMm = gridSpacingMm(viewport.scale)
  const verticals = axisSamples(axisProjection(viewport, 'horizontal'), size.width, spacingMm).map(
    (sample): GridLine => ({
      orientation: 'vertical',
      worldValue: sample.worldValue,
      screen: sample.screen,
    }),
  )
  const horizontals = axisSamples(axisProjection(viewport, 'vertical'), size.height, spacingMm).map(
    (sample): GridLine => ({
      orientation: 'horizontal',
      worldValue: sample.worldValue,
      screen: sample.screen,
    }),
  )
  return { spacingMm, lines: [...verticals, ...horizontals] }
}
