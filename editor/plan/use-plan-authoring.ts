import { useEffect, useState } from 'react'
import type { Point } from '../../core'
import type { EditorSession } from '../../bridge'
import type { ToolId } from '../tools/active-tool-context'
import { isTextEntry } from './keyboard-guard'
import { CANDIDATE_STEP_MM, nudgeCandidate } from './keyboard-candidate'
import {
  advanceWallTool,
  cancelWallTool,
  IDLE_WALL_TOOL,
  wallRunEnded,
  type WallToolState,
} from './wall-tool'

// The keyboard authoring run seeds its candidate at the world origin when no
// viewport is supplied, so the candidate is reachable before any pointer move.
const ORIGIN: Point = { x: 0, y: 0 }

export interface PlanAuthoringDeps {
  session: EditorSession
  tool: ToolId
  activeFloorId: string | null
}

export interface PlanAuthoringResult {
  candidate: Point
  announcement: string
}

// The state the wall handler reads and writes for one keystroke, plus the
// setters that surface the next candidate, tool state, and announcement.
interface WallKeyContext {
  event: KeyboardEvent
  session: EditorSession
  activeFloorId: string | null
  candidate: Point
  toolState: WallToolState
  setCandidate: (point: Point) => void
  setToolState: (state: WallToolState) => void
  setAnnouncement: (message: string) => void
}

// The announcement for a moved candidate, naming its world coordinate.
function candidateMessage(point: Point): string {
  return `Candidate at ${point.x}, ${point.y}`
}

// Drop a wall vertex at the candidate, dispatching the same commands the pointer
// path dispatches, then advance the wall tool state. A same-point Enter ends the
// run (the tool returns to idle with no command), so announce the finish; any
// other advance keeps drawing, so announce the dropped vertex.
function dropWallVertex(ctx: WallKeyContext): void {
  const floorId = ctx.activeFloorId ?? ctx.session.getProject().floors[0]?.id
  if (floorId === undefined) {
    return
  }
  ctx.event.preventDefault()
  const result = advanceWallTool(ctx.toolState, ctx.candidate, floorId)
  result.commands?.forEach((command) => {
    ctx.session.dispatch(command)
  })
  ctx.setToolState(result.state)
  ctx.setAnnouncement(wallRunEnded(result) ? 'Wall run finished' : 'Wall vertex dropped')
}

// Abandon the in-progress run, returning the tool to idle and committing nothing.
function cancelWallRun(ctx: WallKeyContext): void {
  ctx.event.preventDefault()
  ctx.setToolState(cancelWallTool(ctx.toolState))
  ctx.setAnnouncement('Wall run cancelled')
}

// Handle one keystroke while the wall tool is active: arrow keys move the
// candidate, Enter drops a vertex or finishes the run, Escape cancels the run,
// any other key falls through.
function handleWallKey(ctx: WallKeyContext): void {
  const next = nudgeCandidate(ctx.candidate, ctx.event.key, CANDIDATE_STEP_MM)
  if (next !== null) {
    ctx.event.preventDefault()
    ctx.setCandidate(next)
    ctx.setAnnouncement(candidateMessage(next))
    return
  }
  if (ctx.event.key === 'Enter') {
    dropWallVertex(ctx)
    return
  }
  if (ctx.event.key === 'Escape') {
    cancelWallRun(ctx)
  }
}

/**
 * Binds the creative-tool authoring keystrokes to the window. While the
 * draw-wall tool is active, arrow keys nudge a keyboard-reachable candidate
 * point by a grid step and Enter drops a wall vertex at the candidate by
 * dispatching the same commands the pointer path dispatches. Inert under any
 * other tool and ignored while a form control is focused, mirroring the
 * selection and furniture keyboard hooks.
 */
export function usePlanAuthoring(deps: PlanAuthoringDeps): PlanAuthoringResult {
  const { session, tool, activeFloorId } = deps
  const [candidate, setCandidate] = useState<Point>(ORIGIN)
  const [toolState, setToolState] = useState<WallToolState>(IDLE_WALL_TOOL)
  const [announcement, setAnnouncement] = useState('')

  useEffect(() => {
    if (tool !== 'draw-wall') {
      return undefined
    }
    const listener = (event: KeyboardEvent): void => {
      if (isTextEntry(event.target)) {
        return
      }
      handleWallKey({
        event,
        session,
        activeFloorId,
        candidate,
        toolState,
        setCandidate,
        setToolState,
        setAnnouncement,
      })
    }
    window.addEventListener('keydown', listener)
    return () => {
      window.removeEventListener('keydown', listener)
    }
  }, [session, tool, activeFloorId, candidate, toolState])

  return { candidate, announcement }
}
