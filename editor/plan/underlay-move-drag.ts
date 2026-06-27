import { moveUnderlay, type Command, type MoveUnderlayParams, type Point } from '../../core'

export type UnderlayMoveDragState =
  | { phase: 'idle' }
  | { phase: 'dragging'; origin: Point; underlayId: string }

export const IDLE_UNDERLAY_MOVE_DRAG: UnderlayMoveDragState = { phase: 'idle' }

export interface UnderlayMoveDragResult {
  state: UnderlayMoveDragState
  command?: Command<MoveUnderlayParams>
}

function dragDelta(origin: Point, pointer: Point): Point {
  return { x: pointer.x - origin.x, y: pointer.y - origin.y }
}

/** Begins a rigid drag of the underlay, carrying the grab origin and its model id. */
export function beginUnderlayMoveDrag(origin: Point, underlayId: string): UnderlayMoveDragState {
  return { phase: 'dragging', origin, underlayId }
}

/**
 * Ends the drag, returning to idle. A non-zero pointer delta emits a single
 * `moveUnderlay` so the whole drag is one undoable command; a zero delta (a press
 * that did not move) emits nothing.
 */
export function endUnderlayMoveDrag(
  state: UnderlayMoveDragState,
  pointer: Point,
  floorId: string,
): UnderlayMoveDragResult {
  if (state.phase !== 'dragging') return { state: IDLE_UNDERLAY_MOVE_DRAG }
  const delta = dragDelta(state.origin, pointer)
  if (delta.x === 0 && delta.y === 0) return { state: IDLE_UNDERLAY_MOVE_DRAG }
  return { state: IDLE_UNDERLAY_MOVE_DRAG, command: moveUnderlay(floorId, state.underlayId, delta) }
}
