import { addWall, type Command, type Point } from '../../core'

export type WallToolState = { phase: 'idle' } | { phase: 'drawing'; start: Point }

export const IDLE_WALL_TOOL: WallToolState = { phase: 'idle' }

export interface WallToolResult {
  state: WallToolState
  command?: Command
}

// Exact equality is intentional: a zero-length wall only arises from clicking the
// same pixel twice, which maps to identical world coordinates. Snap tolerance is Phase 1.
function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y
}

export function advanceWallTool(
  state: WallToolState,
  point: Point,
  floorId: string,
): WallToolResult {
  if (state.phase === 'idle') {
    return { state: { phase: 'drawing', start: point } }
  }
  if (samePoint(state.start, point)) {
    return { state: IDLE_WALL_TOOL }
  }
  return { state: IDLE_WALL_TOOL, command: addWall(floorId, state.start, point) }
}

// Abandon any in-progress wall, returning the tool to idle.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function cancelWallTool(_state: WallToolState): WallToolState {
  return IDLE_WALL_TOOL
}

export function wallPreviewSegment(
  state: WallToolState,
  point: Point,
): { start: Point; end: Point } | undefined {
  if (state.phase === 'drawing') {
    return { start: state.start, end: point }
  }
  return undefined
}
