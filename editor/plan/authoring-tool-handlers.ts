import {
  createFurnitureInstance,
  createOpening,
  distance,
  placeFurniture,
  placeOpening,
  type Point,
  type SceneGraph,
} from '../../core'
import type { LibraryItem } from '../../storage'
import type { EditorSession } from '../../bridge'
import { CANDIDATE_STEP_MM, nudgeCandidate } from './keyboard-candidate'
import { DEFAULT_HIT_TOLERANCE_MM } from './hit-test'
import { placeOpeningTarget } from './place-opening'
import { advanceWallTool, cancelWallTool, wallRunEnded, type WallToolState } from './wall-tool'
import { advanceDimensionTool, type DimensionToolState } from './dimension-tool'

// core distance() reports spans in millimetres, so dimension announcements name
// that unit explicitly rather than embedding a bare literal at the callsite.
const DISTANCE_UNIT = 'mm'

// The tool-independent state and setters one keystroke reads, threaded so the
// per-tool key handlers can compose their own context object.
export interface AuthoringRun {
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

export type WallKeyContext = ToolKeyContext<WallToolState>
export type DimensionKeyContext = ToolKeyContext<DimensionToolState>

// One keystroke while the opening tool is active: the shared run plus the event
// and the wall graph and placement type the opening branch projects onto. Either
// being undefined makes the Enter a no-op via dropOpening's early return, so the
// caller never has to pre-check the optional deps.
export interface OpeningKeyContext extends AuthoringRun {
  event: KeyboardEvent
  graph: SceneGraph | undefined
  placementType: string | undefined
}

// One keystroke while the place-furniture tool is active: the shared run plus the
// event, the armed item, and the ghost rotation the furniture branch drops. A null
// armed item makes the Enter a no-op via dropFurniture's early return.
export interface FurnitureKeyContext extends AuthoringRun {
  event: KeyboardEvent
  armed: LibraryItem | null
  rotation: number
}

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
// candidate, Enter drops a vertex or finishes the run, Escape cancels a run that
// is in progress, any other key falls through.
export function handleWallKey(ctx: WallKeyContext): void {
  if (handleNudge(ctx, ctx.event)) {
    return
  }
  if (ctx.event.key === 'Enter') {
    dropWallVertex(ctx)
    return
  }
  // Only cancel a keyboard run that is actually open. With no keyboard run in
  // progress, Escape is left untouched so it neither announces a phantom cancel
  // nor disturbs the pointer wall tool's own Escape handling on the same event.
  if (ctx.event.key === 'Escape' && ctx.toolState.phase === 'drawing') {
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
export function handleDimensionKey(ctx: DimensionKeyContext): void {
  if (handleNudge(ctx, ctx.event)) {
    return
  }
  if (ctx.event.key === 'Enter') {
    dropDimensionEndpoint(ctx)
  }
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
export function handleOpeningKey(ctx: OpeningKeyContext): void {
  if (handleNudge(ctx, ctx.event)) {
    return
  }
  if (ctx.event.key === 'Enter') {
    dropOpening(ctx)
  }
}

// Drop the armed furniture instance at the candidate by dispatching the same
// place-furniture command the pointer path dispatches. With nothing armed, the
// Enter is inert; otherwise announce the item name so a chair reads "Placed Wingback chair".
function dropFurniture(ctx: FurnitureKeyContext): void {
  if (ctx.armed === null) {
    return
  }
  const floorId = resolveFloorId(ctx)
  if (floorId === undefined) {
    return
  }
  ctx.event.preventDefault()
  const furniture = createFurnitureInstance({
    assetRef: ctx.armed.reference,
    position: ctx.candidate,
    footprint: ctx.armed.footprint,
    height: ctx.armed.height,
    rotation: ctx.rotation,
    ...(ctx.armed.name !== '' ? { name: ctx.armed.name } : {}),
  })
  ctx.session.dispatch(placeFurniture(floorId, furniture))
  ctx.setAnnouncement(`Placed ${ctx.armed.name}`)
}

// Handle one keystroke while the place-furniture tool is active: arrow keys move
// the candidate, Enter drops the armed item at the candidate, any other key falls
// through.
export function handleFurnitureKey(ctx: FurnitureKeyContext): void {
  if (handleNudge(ctx, ctx.event)) {
    return
  }
  if (ctx.event.key === 'Enter') {
    dropFurniture(ctx)
  }
}
