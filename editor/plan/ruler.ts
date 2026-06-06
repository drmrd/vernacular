import { gridSpacingMm } from './grid'
import { axisProjection, axisSamples, type Viewport } from './viewport'

export const RULER_THICKNESS_PX = 20

export const RULER_MIN_LABEL_GAP_PX = 60

export interface RulerTick {
  worldValue: number
  screen: number
  label: string
}

export function rulerTicks(
  viewport: Viewport,
  lengthPx: number,
  orientation: 'horizontal' | 'vertical',
): RulerTick[] {
  const gridSpacing = gridSpacingMm(viewport.scale)
  const stepPx = gridSpacing * viewport.scale
  // Label every Nth grid line, where N is the smallest integer that spreads
  // adjacent labels at least RULER_MIN_LABEL_GAP_PX apart. Keeping the label
  // spacing an integer multiple of the grid spacing leaves ticks grid-aligned.
  const labelEvery = Math.max(1, Math.ceil(RULER_MIN_LABEL_GAP_PX / stepPx))
  const labelSpacingMm = gridSpacing * labelEvery
  return axisSamples(axisProjection(viewport, orientation), lengthPx, labelSpacingMm).map(
    (sample) => ({
      worldValue: sample.worldValue,
      screen: sample.screen,
      // Raw millimetre value; unit-aware formatting arrives with the units slice.
      label: String(Math.round(sample.worldValue)),
    }),
  )
}
