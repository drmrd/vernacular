import type { Point } from '../../core'
import type { PreviewSegment } from './draw-plan'

export type CalibrationToolState = { phase: 'idle' } | { phase: 'measuring'; start: Point }

export const IDLE_CALIBRATION_TOOL: CalibrationToolState = { phase: 'idle' }

export interface CalibrationToolResult {
  state: CalibrationToolState
  segment?: PreviewSegment
}

// Exact equality is intentional: a zero-length measurement only arises from clicking the
// same point twice, which maps to identical world coordinates. Snap tolerance is later.
function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y
}

export function advanceCalibrationTool(
  state: CalibrationToolState,
  point: Point,
): CalibrationToolResult {
  if (state.phase === 'idle') {
    return { state: { phase: 'measuring', start: point } }
  }
  if (samePoint(state.start, point)) {
    return { state: IDLE_CALIBRATION_TOOL }
  }
  return { state: IDLE_CALIBRATION_TOOL, segment: { start: state.start, end: point } }
}

/** The live { start, end } rubber-band while measuring; undefined when idle. */
export function calibrationPreviewSegment(
  state: CalibrationToolState,
  point: Point,
): PreviewSegment | undefined {
  return state.phase === 'measuring' ? { start: state.start, end: point } : undefined
}
