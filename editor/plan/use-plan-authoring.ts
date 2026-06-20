import { useEffect, useState } from 'react'
import { distance, type Point } from '../../core'
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
import {
  advanceDimensionTool,
  IDLE_DIMENSION_TOOL,
  type DimensionToolState,
} from './dimension-tool'

// The keyboard authoring run seeds its candidate at the world origin when no
// viewport is supplied, so the candidate is reachable before any pointer move.
const ORIGIN: Point = { x: 0, y: 0 }

// core distance() reports spans in millimetres, so dimension announcements name
// that unit explicitly rather than embedding a bare literal at the callsite.
const DISTANCE_UNIT = 'mm'

export interface PlanAuthoringDeps {
  session: EditorSession
  tool: ToolId
  activeFloorId: string | null
}

export interface PlanAuthoringResult {
  candidate: Point
  announcement: string
}

// The tool-independent state and setters one keystroke reads, threaded so the
// per-tool key handlers can compose their own context object.
interface AuthoringRun {
  session: EditorSession
  activeFloorId: string | null
  candidate: Point
  setCandidate: (point: Point) => void
  setAnnouncement: (message: string) => void
}

// One keystroke for a specific tool: the shared run plus the event and the
// per-tool state the handler reads and writes.
interface ToolKeyContext<State> extends AuthoringRun {
  event: KeyboardEvent
  toolState: State
  setToolState: (state: State) => void
}

type WallKeyContext = ToolKeyContext<WallToolState>
type DimensionKeyContext = ToolKeyContext<DimensionToolState>

// The floor the dropped entity lands on: the active floor when one is selected,
// otherwise the project's first floor; undefined when the project has no floors.
function resolveFloorId(ctx: AuthoringRun): string | undefined {
  return ctx.activeFloorId ?? ctx.session.getProject().floors[0]?.id
}

// The announcement for a moved candidate, naming its world coordinate.
function candidateMessage(point: Point): string {
  return `Candidate at ${point.x}, ${point.y}`
}

// The announcement for a measured dimension, naming its span and unit.
function dimensionAnnouncement(span: number): string {
  return `Dimension measured ${span} ${DISTANCE_UNIT}`
}

// The arrow-key prologue shared by every tool handler: nudge the candidate, and
// when an arrow key moved it, consume the event and announce the new position.
// Returns true when it handled the keystroke so the caller can return early.
function handleNudge(ctx: AuthoringRun, event: KeyboardEvent): boolean {
  const next = nudgeCandidate(ctx.candidate, event.key, CANDIDATE_STEP_MM)
  if (next === null) {
    return false
  }
  event.preventDefault()
  ctx.setCandidate(next)
  ctx.setAnnouncement(candidateMessage(next))
  return true
}

// Drop a wall vertex at the candidate, dispatching the same commands the pointer
// path dispatches, then advance the wall tool state. A same-point Enter ends the
// run (the tool returns to idle with no command), so announce the finish; any
// other advance keeps drawing, so announce the dropped vertex.
function dropWallVertex(ctx: WallKeyContext): void {
  const floorId = resolveFloorId(ctx)
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
  if (handleNudge(ctx, ctx.event)) {
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

// Drop a dimension endpoint at the candidate. The first Enter anchors the start
// (no command), the second Enter at a different candidate dispatches the single
// add-dimension command and announces the measured span; a same-point second
// Enter idles the tool and commits nothing.
function dropDimensionEndpoint(ctx: DimensionKeyContext): void {
  const floorId = resolveFloorId(ctx)
  if (floorId === undefined) {
    return
  }
  ctx.event.preventDefault()
  const result = advanceDimensionTool(ctx.toolState, ctx.candidate, floorId)
  if (result.command !== undefined) {
    ctx.session.dispatch(result.command)
    const span = distance(result.command.params.dimension.start, ctx.candidate)
    ctx.setAnnouncement(dimensionAnnouncement(span))
  }
  ctx.setToolState(result.state)
}

// Handle one keystroke while the dimension tool is active: arrow keys move the
// candidate, Enter drops a dimension endpoint, any other key falls through.
function handleDimensionKey(ctx: DimensionKeyContext): void {
  if (handleNudge(ctx, ctx.event)) {
    return
  }
  if (ctx.event.key === 'Enter') {
    dropDimensionEndpoint(ctx)
  }
}

// Only the creative tools that drop free points on the canvas are wired here.
function isAuthoringTool(tool: ToolId): tool is 'draw-wall' | 'dimension' {
  return tool === 'draw-wall' || tool === 'dimension'
}

/**
 * Binds the creative-tool authoring keystrokes to the window. While the
 * draw-wall or dimension tool is active, arrow keys nudge a keyboard-reachable
 * candidate point by a grid step and Enter drops a wall vertex or a dimension
 * endpoint at the candidate by dispatching the same commands the pointer path
 * dispatches. Inert under any other tool and ignored while a form control is
 * focused, mirroring the selection and furniture keyboard hooks.
 */
export function usePlanAuthoring(deps: PlanAuthoringDeps): PlanAuthoringResult {
  const { session, tool, activeFloorId } = deps
  const [candidate, setCandidate] = useState<Point>(ORIGIN)
  const [wallToolState, setWallToolState] = useState<WallToolState>(IDLE_WALL_TOOL)
  const [dimensionToolState, setDimensionToolState] =
    useState<DimensionToolState>(IDLE_DIMENSION_TOOL)
  const [announcement, setAnnouncement] = useState('')

  useEffect(() => {
    if (!isAuthoringTool(tool)) {
      return undefined
    }
    const run: AuthoringRun = { session, activeFloorId, candidate, setCandidate, setAnnouncement }
    const listener = (event: KeyboardEvent): void => {
      if (isTextEntry(event.target)) {
        return
      }
      if (tool === 'draw-wall') {
        handleWallKey({ ...run, event, toolState: wallToolState, setToolState: setWallToolState })
        return
      }
      handleDimensionKey({
        ...run,
        event,
        toolState: dimensionToolState,
        setToolState: setDimensionToolState,
      })
    }
    window.addEventListener('keydown', listener)
    return () => {
      window.removeEventListener('keydown', listener)
    }
  }, [session, tool, activeFloorId, candidate, wallToolState, dimensionToolState])

  return { candidate, announcement }
}
