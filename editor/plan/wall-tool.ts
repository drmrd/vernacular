import { addWall, type Command, type Point } from '../../core'

export type WallToolState = { phase: 'idle' } | { phase: 'drawing'; vertices: readonly Point[] }

export const IDLE_WALL_TOOL: WallToolState = { phase: 'idle' }

// The smallest run that a click on the first corner closes into a loop: a
// triangle is the smallest enclosed room.
const MIN_LOOP_VERTICES = 3

export interface WallToolResult {
  state: WallToolState
  commands?: readonly Command[]
}

export interface PreviewSegment {
  start: Point
  end: Point
}

// Exact equality is intentional: snapping resolves a click to fixed world
// coordinates, so a corner placed on top of another maps to identical points.
function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y
}

function lastVertex(vertices: readonly Point[]): Point {
  return vertices[vertices.length - 1] as Point
}

function firstVertex(vertices: readonly Point[]): Point {
  return vertices[0] as Point
}

// The segments between consecutive corners, optionally closing back to the first.
function runSegments(vertices: readonly Point[], close: boolean): PreviewSegment[] {
  const corners = close ? [...vertices, firstVertex(vertices)] : vertices
  const segments: PreviewSegment[] = []
  for (let index = 0; index + 1 < corners.length; index += 1) {
    segments.push({ start: corners[index] as Point, end: corners[index + 1] as Point })
  }
  return segments
}

function segmentCommands(vertices: readonly Point[], floorId: string, close: boolean): Command[] {
  return runSegments(vertices, close).map((segment) => addWall(floorId, segment.start, segment.end))
}

export function advanceWallTool(
  state: WallToolState,
  point: Point,
  floorId: string,
): WallToolResult {
  if (state.phase === 'idle') {
    return { state: { phase: 'drawing', vertices: [point] } }
  }
  const { vertices } = state
  if (samePoint(point, lastVertex(vertices))) {
    return { state }
  }
  if (vertices.length >= MIN_LOOP_VERTICES && samePoint(point, firstVertex(vertices))) {
    return { state: IDLE_WALL_TOOL, commands: segmentCommands(vertices, floorId, true) }
  }
  return { state: { phase: 'drawing', vertices: [...vertices, point] } }
}

export function finishWallTool(state: WallToolState, floorId: string): WallToolResult {
  if (state.phase === 'idle' || state.vertices.length < 2) {
    return { state: IDLE_WALL_TOOL }
  }
  return { state: IDLE_WALL_TOOL, commands: segmentCommands(state.vertices, floorId, false) }
}

export function backspaceWallTool(state: WallToolState): WallToolState {
  if (state.phase === 'idle') {
    return IDLE_WALL_TOOL
  }
  const remaining = state.vertices.slice(0, -1)
  return remaining.length === 0 ? IDLE_WALL_TOOL : { phase: 'drawing', vertices: remaining }
}

// Abandon any in-progress run, returning the tool to idle. Every state cancels to
// idle, so the current state is accepted for a uniform transition signature but unread.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- uniform transition signature; cancel ignores the current state
export function cancelWallTool(_state: WallToolState): WallToolState {
  return IDLE_WALL_TOOL
}

export function wallPreviewSegment(state: WallToolState, point: Point): PreviewSegment | undefined {
  if (state.phase === 'drawing') {
    return { start: lastVertex(state.vertices), end: point }
  }
  return undefined
}

export function wallGhostSegments(state: WallToolState): PreviewSegment[] {
  return state.phase === 'drawing' ? runSegments(state.vertices, false) : []
}
