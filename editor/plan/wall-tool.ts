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

function commitSegment(from: Point, to: Point, floorId: string): Command[] {
  return [addWall(floorId, from, to)]
}

/**
 * Apply a click. The first click anchors the run. Each later click commits one wall
 * from the previous corner to the clicked point and keeps drawing, so a wall exists
 * the moment its end is placed. A click back on the active (last) corner ends the
 * run; a click on the first corner, once the run has three corners, commits the
 * closing segment and ends the run so the room derives.
 */
export function advanceWallTool(
  state: WallToolState,
  point: Point,
  floorId: string,
): WallToolResult {
  if (state.phase === 'idle') {
    return { state: { phase: 'drawing', vertices: [point] } }
  }
  const { vertices } = state
  const from = lastVertex(vertices)
  if (samePoint(point, from)) {
    return { state: IDLE_WALL_TOOL }
  }
  if (vertices.length >= MIN_LOOP_VERTICES && samePoint(point, firstVertex(vertices))) {
    return { state: IDLE_WALL_TOOL, commands: commitSegment(from, firstVertex(vertices), floorId) }
  }
  return {
    state: { phase: 'drawing', vertices: [...vertices, point] },
    commands: commitSegment(from, point, floorId),
  }
}

/** End the run. Each placed segment is already committed, so finishing adds no wall. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- uniform transition signature; finishing ignores the current state
export function finishWallTool(_state: WallToolState): WallToolResult {
  return { state: IDLE_WALL_TOOL }
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

// The placed segments render as committed walls from the scene, so the in-progress
// run paints no separate ghost. Kept as a stable seam for the interaction layer.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- uniform signature; the run draws no ghost under immediate commit
export function wallGhostSegments(_state: WallToolState): PreviewSegment[] {
  return []
}
