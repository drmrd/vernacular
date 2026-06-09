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

function delta(origin: Point, pointer: Point): Point {
  return { x: pointer.x - origin.x, y: pointer.y - origin.y }
}

export function beginMoveDrag(origin: Point, segments: readonly PreviewSegment[]): MoveDragState {
  return { phase: 'dragging', origin, segments }
}

export function moveDragGhost(state: MoveDragState, pointer: Point): readonly PreviewSegment[] {
  if (state.phase !== 'dragging') return []
  const d = delta(state.origin, pointer)
  return state.segments.map((segment) => ({
    start: translatePoint(segment.start, d),
    end: translatePoint(segment.end, d),
  }))
}

// eslint-disable-next-line max-params -- the drag state, the release point, the target floor, and the selected ids are the minimal inputs to commit a move
export function endMoveDrag(
  state: MoveDragState,
  pointer: Point,
  floorId: string,
  entityIds: string[],
): MoveDragResult {
  if (state.phase !== 'dragging') return { state: IDLE_MOVE_DRAG }
  const d = delta(state.origin, pointer)
  if (d.x === 0 && d.y === 0) return { state: IDLE_MOVE_DRAG }
  return { state: IDLE_MOVE_DRAG, command: translateEntities(floorId, entityIds, d) }
}
