import {
  translateEntities,
  translatePoint,
  type Command,
  type Point,
  type TranslateEntitiesParams,
} from '../../core'
import type { PreviewSegment } from './draw-plan'

export type MoveDragState =
  | { phase: 'idle' }
  | { phase: 'dragging'; origin: Point; segments: readonly PreviewSegment[] }

export const IDLE_MOVE_DRAG: MoveDragState = { phase: 'idle' }

export interface MoveDragResult {
  state: MoveDragState
  command?: Command<TranslateEntitiesParams>
}

function dragDelta(origin: Point, pointer: Point): Point {
  return { x: pointer.x - origin.x, y: pointer.y - origin.y }
}

export function beginMoveDrag(origin: Point, segments: readonly PreviewSegment[]): MoveDragState {
  return { phase: 'dragging', origin, segments }
}

export function moveDragGhost(state: MoveDragState, pointer: Point): readonly PreviewSegment[] {
  if (state.phase !== 'dragging') return []
  const delta = dragDelta(state.origin, pointer)
  return state.segments.map((segment) => ({
    start: translatePoint(segment.start, delta),
    end: translatePoint(segment.end, delta),
  }))
}

// eslint-disable-next-line max-params -- the drag state, the release point, the target floor, and the selected ids are the minimal inputs to commit a move
export function endMoveDrag(
  state: MoveDragState,
  pointer: Point,
  floorId: string,
  entityIds: readonly string[],
): MoveDragResult {
  if (state.phase !== 'dragging') return { state: IDLE_MOVE_DRAG }
  const delta = dragDelta(state.origin, pointer)
  if (delta.x === 0 && delta.y === 0) return { state: IDLE_MOVE_DRAG }
  return { state: IDLE_MOVE_DRAG, command: translateEntities(floorId, [...entityIds], delta) }
}
