import type { Point } from '../../core'

import type { Bounds } from './fit'
import type { ScreenPoint } from './viewport'

export type SelectGestureMode = 'pending' | 'panning' | 'marquee'

export interface SelectGestureState {
  mode: SelectGestureMode
  originWorld: Point
  lastCanvas: ScreenPoint
}

export interface SelectMoveSample {
  world: Point
  canvas: ScreenPoint
  shift: boolean
}

export interface SelectMoveResult {
  state: SelectGestureState
  panDelta?: ScreenPoint
  marquee?: Bounds
}

export interface SelectEndSample {
  // The release point. Used only to size a marquee rectangle; a click resolves at
  // the press origin, so the panning and click outcomes ignore it.
  world: Point
  shift: boolean
}

export type SelectEndEffect =
  | { kind: 'click'; world: Point; shift: boolean }
  | { kind: 'marquee'; rect: Bounds }
  | { kind: 'none' }

/** A drag must travel this far in world millimeters before it locks into pan or marquee. */
const MARQUEE_DRAG_THRESHOLD_MM = 50

function normalizedBounds(a: Point, b: Point): Bounds {
  return {
    min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
    max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) },
  }
}

function reachedDragThreshold(rect: Bounds): boolean {
  const width = rect.max.x - rect.min.x
  const height = rect.max.y - rect.min.y
  return width >= MARQUEE_DRAG_THRESHOLD_MM || height >= MARQUEE_DRAG_THRESHOLD_MM
}

function screenDelta(from: ScreenPoint, to: ScreenPoint): ScreenPoint {
  return { x: to.x - from.x, y: to.y - from.y }
}

export function beginSelectGesture(
  originWorld: Point,
  originCanvas: ScreenPoint,
): SelectGestureState {
  return { mode: 'pending', originWorld, lastCanvas: originCanvas }
}

function resolvePanning(state: SelectGestureState, sample: SelectMoveSample): SelectMoveResult {
  return {
    state: { mode: 'panning', originWorld: state.originWorld, lastCanvas: sample.canvas },
    panDelta: screenDelta(state.lastCanvas, sample.canvas),
  }
}

function resolveMarquee(state: SelectGestureState, sample: SelectMoveSample): SelectMoveResult {
  return {
    state: { mode: 'marquee', originWorld: state.originWorld, lastCanvas: sample.canvas },
    marquee: normalizedBounds(state.originWorld, sample.world),
  }
}

export function advanceSelectGesture(
  state: SelectGestureState,
  sample: SelectMoveSample,
): SelectMoveResult {
  let mode = state.mode
  if (mode === 'pending') {
    if (!reachedDragThreshold(normalizedBounds(state.originWorld, sample.world))) {
      return { state }
    }
    mode = sample.shift ? 'marquee' : 'panning'
  }
  return mode === 'marquee' ? resolveMarquee(state, sample) : resolvePanning(state, sample)
}

export function endSelectGesture(
  state: SelectGestureState,
  sample: SelectEndSample,
): SelectEndEffect {
  if (state.mode === 'panning') return { kind: 'none' }
  if (state.mode === 'marquee') {
    return { kind: 'marquee', rect: normalizedBounds(state.originWorld, sample.world) }
  }
  return { kind: 'click', world: state.originWorld, shift: sample.shift }
}
