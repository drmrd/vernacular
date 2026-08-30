import type { AddDimensionParams, Command, Point } from '../../core'
import { addDimension, createDimension } from '../../core'
import type { PreviewSegment } from './draw-plan'

export type DimensionToolState = { phase: 'idle' } | { phase: 'measuring'; start: Point }

export const IDLE_DIMENSION_TOOL: DimensionToolState = { phase: 'idle' }

export interface DimensionToolResult {
  state: DimensionToolState
  command?: Command<AddDimensionParams>
}

// Exact equality is intentional: a zero-length measurement only arises from clicking the
// same point twice, which maps to identical world coordinates. Snap tolerance is later.
function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y
}

export function advanceDimensionTool(
  state: DimensionToolState,
  point: Point,
  floorId: string,
): DimensionToolResult {
  if (state.phase === 'idle') {
    return { state: { phase: 'measuring', start: point } }
  }
  if (samePoint(state.start, point)) {
    return { state: IDLE_DIMENSION_TOOL }
  }
  const command = addDimension(floorId, createDimension({ start: state.start, end: point }))
  return { state: IDLE_DIMENSION_TOOL, command }
}

/**
 * Abandon a measurement in progress, returning the tool to idle and recording
 * nothing. Every state cancels to idle, so the current state is accepted for a
 * uniform transition signature but unread, mirroring cancelWallTool.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- uniform transition signature; cancel ignores the current state
export function cancelDimensionTool(_state: DimensionToolState): DimensionToolState {
  return IDLE_DIMENSION_TOOL
}

/** The live { start, end } rubber-band while measuring; undefined when idle. */
export function dimensionPreview(
  state: DimensionToolState,
  point: Point,
): PreviewSegment | undefined {
  return state.phase === 'measuring' ? { start: state.start, end: point } : undefined
}
