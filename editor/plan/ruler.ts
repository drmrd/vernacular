import {
  DEFAULT_METRIC_PREFERENCES,
  formatLength,
  lengthFormatOptions,
  type UnitPreferences,
} from '../../core'
import type { DrawPlanOptions, PlanDrawingContext } from './draw-plan'
import { gridSpacingMm } from './grid'
import { rulerLabelSpacingMm } from './ruler-label-spacing'
import { axisProjection, axisSamples, type Viewport } from './viewport'
import { DEFAULT_PLAN_PALETTE } from './plan-palette'

export const RULER_THICKNESS_PX = 20

export const RULER_MIN_LABEL_GAP_PX = 60

const RULER_FONT = '10px sans-serif'
const RULER_LABEL_INSET_PX = 2

// Minor ticks (every grid line) hang short from the inner edge; major ticks (the
// labeled spacing) span the full band, so the scale reads at a glance.
const RULER_MINOR_TICK_PX = 6

export interface RulerTick {
  worldValue: number
  screen: number
  label: string
}

// eslint-disable-next-line max-params -- the public seam takes viewport, length, and orientation plus the unit preferences each tick label needs.
export function rulerTicks(
  viewport: Viewport,
  lengthPx: number,
  orientation: 'horizontal' | 'vertical',
  preferences: UnitPreferences,
): RulerTick[] {
  // Labels snap to the unit-nice interval (whole feet in imperial, a metric 1-2-5
  // decade in metric) via rulerLabelSpacingMm, decoupled from the metric drawing
  // grid so the values a reader sees are round in their own unit. Minor ticks stay
  // on the grid spacing.
  const labelSpacingMm = rulerLabelSpacingMm(preferences, viewport.scale)
  return axisSamples(axisProjection(viewport, orientation), lengthPx, labelSpacingMm).map(
    (sample) => ({
      worldValue: sample.worldValue,
      screen: sample.screen,
      label: formatLength(sample.worldValue, lengthFormatOptions(preferences)),
    }),
  )
}

export function drawRulers(ctx: PlanDrawingContext, options: DrawPlanOptions): void {
  const preferences = options.roomLabels?.preferences ?? DEFAULT_METRIC_PREFERENCES
  const palette = options.palette ?? DEFAULT_PLAN_PALETTE
  const size = { width: options.width, height: options.height }
  ctx.fillStyle = palette.rulerBand
  ctx.fillRect(0, 0, size.width, RULER_THICKNESS_PX)
  ctx.fillRect(0, 0, RULER_THICKNESS_PX, size.height)
  // Both axes render with shared tick/text styles set once here; drawRulerTicks
  // relies on this state (strokeStyle, fillStyle, font, textAlign, textBaseline)
  // and never resets it per tick or per axis.
  ctx.strokeStyle = palette.rulerTick
  ctx.fillStyle = palette.rulerText
  ctx.font = RULER_FONT
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'

  const viewport = options.viewport
  drawRulerTicks(ctx, viewport, { orientation: 'horizontal', lengthPx: size.width }, preferences)
  drawRulerTicks(ctx, viewport, { orientation: 'vertical', lengthPx: size.height }, preferences)
}

// eslint-disable-next-line max-params -- ctx, viewport, and axis describe one ruler edge plus the unit preferences rulerTicks formats labels with.
function drawRulerTicks(
  ctx: PlanDrawingContext,
  viewport: Viewport,
  axis: { orientation: 'horizontal' | 'vertical'; lengthPx: number },
  preferences: UnitPreferences,
): void {
  const isHorizontal = axis.orientation === 'horizontal'
  const minorStart = RULER_THICKNESS_PX - RULER_MINOR_TICK_PX
  // Minor ticks mark every grid line as short marks hanging from the inner (grid) edge.
  const projection = axisProjection(viewport, axis.orientation)
  for (const sample of axisSamples(projection, axis.lengthPx, gridSpacingMm(viewport.scale))) {
    strokeTick(ctx, isHorizontal, sample.screen, minorStart)
  }
  // Major ticks at the labeled spacing span the full band and carry the unit label.
  for (const tick of rulerTicks(viewport, axis.lengthPx, axis.orientation, preferences)) {
    strokeTick(ctx, isHorizontal, tick.screen, 0)
    if (isHorizontal) {
      ctx.fillText(tick.label, tick.screen + RULER_LABEL_INSET_PX, RULER_LABEL_INSET_PX)
    } else {
      ctx.fillText(tick.label, RULER_LABEL_INSET_PX, tick.screen + RULER_LABEL_INSET_PX)
    }
  }
}

// Strokes one ruler tick: a line at `screen` running from `near` across to the inner
// (grid) edge. Horizontal-axis ticks run vertically; vertical-axis ticks run across.
// eslint-disable-next-line max-params -- ctx, the axis flag, the tick position, and its near extent are each distinct tick geometry.
function strokeTick(
  ctx: PlanDrawingContext,
  isHorizontal: boolean,
  screen: number,
  near: number,
): void {
  ctx.beginPath()
  if (isHorizontal) {
    ctx.moveTo(screen, near)
    ctx.lineTo(screen, RULER_THICKNESS_PX)
  } else {
    ctx.moveTo(near, screen)
    ctx.lineTo(RULER_THICKNESS_PX, screen)
  }
  ctx.stroke()
}
