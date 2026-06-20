import { useEffect, useState } from 'react'
import { createOpening, distance, placeOpening, type Point, type SceneGraph } from '../../core'
import type { EditorSession } from '../../bridge'
import type { ToolId } from '../tools/active-tool-context'
import { isTextEntry } from './keyboard-guard'
import { CANDIDATE_STEP_MM, nudgeCandidate } from './keyboard-candidate'
import { DEFAULT_HIT_TOLERANCE_MM } from './hit-test'
import { placeOpeningTarget } from './place-opening'
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
  /** Wall graph the opening branch projects the candidate onto via placeOpeningTarget. */
  graph?: SceneGraph
  /** Element-type id the opening branch places (e.g. 'single-swing-door'). */
  placementType?: string
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

// The announcement for a placed opening, named by the placement type so a door
// reads "Door placed" and a window reads "Window placed". Anything else falls
// back to a generic phrase without nesting ternaries.
function openingAnnouncement(placementType: string): string {
  if (placementType.includes('door')) {
    return 'Door placed'
  }
  if (placementType.includes('window')) {
    return 'Window placed'
  }
  return 'Opening placed'
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

// One keystroke while the opening tool is active: the shared run plus the event
// and the wall graph and placement type the opening branch projects onto. Either
// being undefined makes the Enter a no-op via dropOpening's early return, so the
// caller never has to pre-check the optional deps.
interface OpeningKeyContext extends AuthoringRun {
  event: KeyboardEvent
  graph: SceneGraph | undefined
  placementType: string | undefined
}

// Place an opening at the candidate by projecting it onto the nearest wall. On a
// hit, dispatch the same place-opening command the pointer path dispatches for a
// freshly created opening of the active placement type; on a miss, announce that
// no wall sits near the candidate and dispatch nothing. This is a keyboard-only
// path, so the miss phrasing names the candidate rather than a pointer cursor.
function dropOpening(ctx: OpeningKeyContext): void {
  if (ctx.graph === undefined || ctx.placementType === undefined) {
    return
  }
  ctx.event.preventDefault()
  const target = placeOpeningTarget(ctx.graph, ctx.candidate, DEFAULT_HIT_TOLERANCE_MM)
  if (target === null) {
    ctx.setAnnouncement('No wall near the candidate')
    return
  }
  const opening = createOpening({
    type: ctx.placementType,
    hostWallId: target.hostWallId,
    position: target.position,
  })
  ctx.session.dispatch(placeOpening(target.floorId, opening))
  ctx.setAnnouncement(openingAnnouncement(ctx.placementType))
}

// Handle one keystroke while the opening tool is active: arrow keys move the
// candidate, Enter places an opening at the candidate, any other key falls through.
function handleOpeningKey(ctx: OpeningKeyContext): void {
  if (handleNudge(ctx, ctx.event)) {
    return
  }
  if (ctx.event.key === 'Enter') {
    dropOpening(ctx)
  }
}

// Only the creative tools that drop free points on the canvas are wired here.
function isAuthoringTool(tool: ToolId): tool is 'draw-wall' | 'dimension' | 'place-opening' {
  return tool === 'draw-wall' || tool === 'dimension' || tool === 'place-opening'
}

// The full set of per-tool state and graph the window listener routes a
// keystroke into, threaded as one object so the hook body stays lean.
interface AuthoringTools {
  tool: ToolId
  run: AuthoringRun
  wallState: WallKeyContext['toolState']
  setWallState: WallKeyContext['setToolState']
  dimensionState: DimensionKeyContext['toolState']
  setDimensionState: DimensionKeyContext['setToolState']
  graph: SceneGraph | undefined
  placementType: string | undefined
}

// Install the window keydown listener that routes a keystroke to the active
// tool, with cleanup. Kept out of the hook body so usePlanAuthoring stays lean.
function listenForAuthoringKeys(tools: AuthoringTools): () => void {
  const listener = (event: KeyboardEvent): void => {
    if (!isTextEntry(event.target)) {
      routeAuthoringKey(tools, event)
    }
  }
  window.addEventListener('keydown', listener)
  return () => {
    window.removeEventListener('keydown', listener)
  }
}

function routeWallKey(tools: AuthoringTools, event: KeyboardEvent): void {
  handleWallKey({ ...tools.run, event, toolState: tools.wallState, setToolState: tools.setWallState })
}

function routeOpeningKey(tools: AuthoringTools, event: KeyboardEvent): void {
  handleOpeningKey({ ...tools.run, event, graph: tools.graph, placementType: tools.placementType })
}

function routeDimensionKey(tools: AuthoringTools, event: KeyboardEvent): void {
  const { run, dimensionState, setDimensionState } = tools
  handleDimensionKey({ ...run, event, toolState: dimensionState, setToolState: setDimensionState })
}

// Route one keystroke to the active tool's handler. Each authoring tool names its
// own branch explicitly and an unhandled tool does nothing, so a new tool (e.g.
// furniture) adds its own case without inheriting another tool's branch as an
// accidental fallback. Each handler runs its own arrow-nudge prologue, so this
// only picks the branch by the active tool.
function routeAuthoringKey(tools: AuthoringTools, event: KeyboardEvent): void {
  switch (tools.tool) {
    case 'draw-wall':
      routeWallKey(tools, event)
      return
    case 'place-opening':
      routeOpeningKey(tools, event)
      return
    case 'dimension':
      routeDimensionKey(tools, event)
      return
    default:
      return
  }
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
  const { session, tool, activeFloorId, graph, placementType } = deps
  const [candidate, setCandidate] = useState<Point>(ORIGIN)
  const [wallToolState, setWallToolState] = useState<WallToolState>(IDLE_WALL_TOOL)
  const [dimensionToolState, setDimensionToolState] =
    useState<DimensionToolState>(IDLE_DIMENSION_TOOL)
  const [announcement, setAnnouncement] = useState('')

  useEffect(() => {
    if (!isAuthoringTool(tool)) {
      return undefined
    }
    return listenForAuthoringKeys({
      tool,
      run: { session, activeFloorId, candidate, setCandidate, setAnnouncement },
      wallState: wallToolState,
      setWallState: setWallToolState,
      dimensionState: dimensionToolState,
      setDimensionState: setDimensionToolState,
      graph,
      placementType,
    })
  }, [
    session,
    tool,
    activeFloorId,
    candidate,
    wallToolState,
    dimensionToolState,
    graph,
    placementType,
  ])

  return { candidate, announcement }
}
