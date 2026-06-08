import type { PlanDrawingContext } from './draw-plan'
import { gridSpacingMm } from './grid'
import { axisProjection, axisSamples, type Viewport, type ViewportSize } from './viewport'

export const RULER_THICKNESS_PX = 20

export const RULER_MIN_LABEL_GAP_PX = 60

const RULER_BAND_COLOR = '#f5f7fa'
const RULER_TICK_COLOR = '#c2c8d0'
const RULER_TEXT_COLOR = '#5a6470'
const RULER_FONT = '10px sans-serif'
const RULER_LABEL_INSET_PX = 2

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

export function drawRulers(ctx: PlanDrawingContext, viewport: Viewport, size: ViewportSize): void {
  ctx.fillStyle = RULER_BAND_COLOR
  ctx.fillRect(0, 0, size.width, RULER_THICKNESS_PX)
  ctx.fillRect(0, 0, RULER_THICKNESS_PX, size.height)
  // Both axes render with shared tick/text styles set once here; drawRulerTicks
  // relies on this state (strokeStyle, fillStyle, font, textAlign, textBaseline)
  // and never resets it per tick or per axis.
  ctx.strokeStyle = RULER_TICK_COLOR
  ctx.fillStyle = RULER_TEXT_COLOR
  ctx.font = RULER_FONT
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'

  drawRulerTicks(ctx, viewport, { orientation: 'horizontal', lengthPx: size.width })
  drawRulerTicks(ctx, viewport, { orientation: 'vertical', lengthPx: size.height })
}

function drawRulerTicks(
  ctx: PlanDrawingContext,
  viewport: Viewport,
  axis: { orientation: 'horizontal' | 'vertical'; lengthPx: number },
): void {
  const isHorizontal = axis.orientation === 'horizontal'
  for (const tick of rulerTicks(viewport, axis.lengthPx, axis.orientation)) {
    ctx.beginPath()
    if (isHorizontal) {
      ctx.moveTo(tick.screen, 0)
      ctx.lineTo(tick.screen, RULER_THICKNESS_PX)
    } else {
      ctx.moveTo(0, tick.screen)
      ctx.lineTo(RULER_THICKNESS_PX, tick.screen)
    }
    ctx.stroke()
    if (isHorizontal) {
      ctx.fillText(tick.label, tick.screen + RULER_LABEL_INSET_PX, RULER_LABEL_INSET_PX)
    } else {
      ctx.fillText(tick.label, RULER_LABEL_INSET_PX, tick.screen + RULER_LABEL_INSET_PX)
    }
  }
}
