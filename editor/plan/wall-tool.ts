import { addWall, type Command, type Point } from '../../core'

export type WallToolState = { phase: 'idle' } | { phase: 'drawing'; start: Point }

export const IDLE_WALL_TOOL: WallToolState = { phase: 'idle' }

export interface WallToolResult {
  state: WallToolState
  command?: Command
}

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
