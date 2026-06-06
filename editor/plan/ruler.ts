import { gridSpacingMm } from './grid'
import { axisProjection, axisSamples, type Viewport } from './viewport'

export const RULER_THICKNESS_PX = 20

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
  const spacingMm = gridSpacingMm(viewport.scale)
  return axisSamples(axisProjection(viewport, orientation), lengthPx, spacingMm).map((sample) => ({
    worldValue: sample.worldValue,
    screen: sample.screen,
    // Raw millimetre value; unit-aware formatting arrives with the units slice.
    label: String(Math.round(sample.worldValue)),
  }))
}
