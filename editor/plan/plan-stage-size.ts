import type { ViewportSize } from './viewport'

/**
 * Narrowest plan stage in pixels. Keeps room for the fit padding and the ruler
 * so a squeezed pane never collapses the drawing area.
 */
export const MIN_PLAN_STAGE_WIDTH = 160

/**
 * Shortest plan stage in pixels. Keeps room for the fit padding and the ruler
 * so a squeezed pane never collapses the drawing area.
 */
export const MIN_PLAN_STAGE_HEIGHT = 120

/**
 * Turns a pane measurement into the stage size. A zero or non-finite size comes
 * from a hidden pane, so it keeps the previous size. Otherwise the size is
 * floored and clamped to the minimums. The previous object is returned when
 * nothing changed, so callers can skip a redundant state update.
 */
export function resolveStageSize(previous: ViewportSize, measured: ViewportSize): ViewportSize {
  if (!isMeasurableSize(measured)) {
    return previous
  }
  const width = Math.max(MIN_PLAN_STAGE_WIDTH, Math.floor(measured.width))
  const height = Math.max(MIN_PLAN_STAGE_HEIGHT, Math.floor(measured.height))
  if (width === previous.width && height === previous.height) {
    return previous
  }
  return { width, height }
}

/** Whether a pane measurement is real: a hidden pane reports zero or non-finite sizes. */
export function isMeasurableSize(measured: ViewportSize): boolean {
  return isMeasurable(measured.width) && isMeasurable(measured.height)
}

function isMeasurable(dimension: number): boolean {
  return Number.isFinite(dimension) && dimension > 0
}
