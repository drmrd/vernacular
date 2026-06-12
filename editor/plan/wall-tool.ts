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

function vertexAt(vertices: readonly Point[], index: number): Point {
  return vertices[index] as Point
}

function lastVertex(vertices: readonly Point[]): Point {
  return vertexAt(vertices, vertices.length - 1)
}

function firstVertex(vertices: readonly Point[]): Point {
  return vertexAt(vertices, 0)
}

/** The corner the next segment draws from while drawing; absent when the tool is idle. */
export function drawingVertex(state: WallToolState): Point | undefined {
  return state.phase === 'drawing' ? lastVertex(state.vertices) : undefined
}

// The segments between consecutive corners along the given path.
function pathSegments(corners: readonly Point[]): PreviewSegment[] {
  const segments: PreviewSegment[] = []
  for (let index = 0; index + 1 < corners.length; index += 1) {
    segments.push({ start: vertexAt(corners, index), end: vertexAt(corners, index + 1) })
  }
  return segments
}

// The segments of an open run, corner to corner.
function openRunSegments(vertices: readonly Point[]): PreviewSegment[] {
  return pathSegments(vertices)
}

// The segments of a run closed back to the first corner.
function closedRunSegments(vertices: readonly Point[]): PreviewSegment[] {
  return pathSegments([...vertices, firstVertex(vertices)])
}

function segmentCommands(segments: readonly PreviewSegment[], floorId: string): Command[] {
  return segments.map((segment) => addWall(floorId, segment.start, segment.end))
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
    return {
      state: IDLE_WALL_TOOL,
      commands: segmentCommands(closedRunSegments(vertices), floorId),
    }
  }
  return { state: { phase: 'drawing', vertices: [...vertices, point] } }
}

export function finishWallTool(state: WallToolState, floorId: string): WallToolResult {
  if (state.phase === 'idle' || state.vertices.length < 2) {
    return { state: IDLE_WALL_TOOL }
  }
  return {
    state: IDLE_WALL_TOOL,
    commands: segmentCommands(openRunSegments(state.vertices), floorId),
  }
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
  return state.phase === 'drawing' ? openRunSegments(state.vertices) : []
}
