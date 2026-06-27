import { useRef, type PointerEvent } from 'react'
import { UNDERLAY_NODE_PREFIX, type Point, type SceneGraph } from '../../core'
import type { EditorSession } from '../../bridge'
import type { ToolId } from '../tools/active-tool-context'
import { hitTestUnderlay } from './hit-test-underlay'
import {
  beginUnderlayMoveDrag,
  endUnderlayMoveDrag,
  IDLE_UNDERLAY_MOVE_DRAG,
  type UnderlayMoveDragState,
} from './underlay-move-drag'
import { eventToCanvas } from './use-viewport-controls'
import { screenToWorld, type Viewport } from './viewport'

const PRIMARY_BUTTON = 0

interface UnderlayMoveDeps {
  session: EditorSession
  graph: SceneGraph
  selectedIds: ReadonlySet<string>
  tool: ToolId
  viewport: Viewport
  // The floor a move commits to (the active floor); null before any floor is selected.
  activeFloorId: string | null
}

export interface UnderlayMove {
  // Each handler returns true when it consumes the pointer, so the composed
  // handlers can stop before the marquee/click selection runs.
  onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => boolean
  onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => boolean
  onPointerUp: (event: PointerEvent<HTMLCanvasElement>) => boolean
}

type StateRef = { current: UnderlayMoveDragState }

function eventToWorld(event: PointerEvent<HTMLCanvasElement>, viewport: Viewport): Point {
  return screenToWorld(eventToCanvas(event, event.currentTarget), viewport)
}

// The floor a move commits to: the active floor, falling back to the first floor
// when none is active yet (mirrors the selection move-drag).
function moveFloorId(deps: UnderlayMoveDeps): string | undefined {
  return deps.activeFloorId ?? deps.session.getProject().floors[0]?.id
}

// The model id of the selected underlay under the pointer, or null. A press only
// grabs an underlay that is already selected, so a click selects before a drag moves.
function grabbedUnderlayId(deps: UnderlayMoveDeps, world: Point): string | null {
  const nodeId = hitTestUnderlay(deps.graph.underlays, world)
  if (nodeId === null || !deps.selectedIds.has(nodeId)) {
    return null
  }
  return nodeId.slice(UNDERLAY_NODE_PREFIX.length)
}

function pointerDown(
  deps: UnderlayMoveDeps,
  stateRef: StateRef,
  event: PointerEvent<HTMLCanvasElement>,
): boolean {
  if (deps.tool !== 'select' || event.button !== PRIMARY_BUTTON) {
    return false
  }
  const world = eventToWorld(event, deps.viewport)
  const underlayId = grabbedUnderlayId(deps, world)
  if (underlayId === null) {
    return false
  }
  stateRef.current = beginUnderlayMoveDrag(world, underlayId)
  return true
}

function pointerUp(
  deps: UnderlayMoveDeps,
  stateRef: StateRef,
  event: PointerEvent<HTMLCanvasElement>,
): boolean {
  const state = stateRef.current
  if (state.phase !== 'dragging') {
    return false
  }
  stateRef.current = IDLE_UNDERLAY_MOVE_DRAG
  const floorId = moveFloorId(deps)
  if (floorId === undefined) {
    return true
  }
  const result = endUnderlayMoveDrag(state, eventToWorld(event, deps.viewport), floorId)
  if (result.command) {
    deps.session.dispatch(result.command)
  }
  return true
}

/**
 * The select-tool underlay move-drag: a press on an already-selected underlay
 * begins a rigid drag, and the release commits a single `moveUnderlay` (one
 * undoable command). The move handler consumes the pointer while dragging so the
 * marquee and click selection stay inert. Inert under any tool but `select`.
 */
export function useUnderlayMove(deps: UnderlayMoveDeps): UnderlayMove {
  const stateRef = useRef<UnderlayMoveDragState>(IDLE_UNDERLAY_MOVE_DRAG)
  return {
    onPointerDown: (event) => pointerDown(deps, stateRef, event),
    onPointerMove: () => stateRef.current.phase === 'dragging',
    onPointerUp: (event) => pointerUp(deps, stateRef, event),
  }
}
