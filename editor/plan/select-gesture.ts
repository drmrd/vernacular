import type { Point } from '../../core'

import type { Bounds } from './fit'
import type { ScreenPoint } from './viewport'

export type SelectGestureMode = 'pending' | 'panning' | 'marquee'

/**
 * How the marquee result folds into the standing selection: `replace` swaps it
 * wholesale, `add` unions with it (Shift and Alt together), `subtract` removes
 * from it (Alt alone).
 */
export type SelectOperation = 'replace' | 'add' | 'subtract'

export type SelectGestureState =
  | { mode: 'pending'; originWorld: Point; lastCanvas: ScreenPoint }
  | { mode: 'panning'; originWorld: Point; lastCanvas: ScreenPoint }
  | { mode: 'marquee'; originWorld: Point; lastCanvas: ScreenPoint; operation: SelectOperation }

export interface SelectMoveSample {
  world: Point
  canvas: ScreenPoint
  shift: boolean
  alt?: boolean
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
  alt?: boolean
}

/**
 * A left-to-right marquee selects only fully contained entities (`window`); a
 * right-to-left marquee also grabs the ones it merely crosses (`crossing`).
 */
export type MarqueeMode = 'window' | 'crossing'

export type SelectEndEffect =
  | { kind: 'click'; world: Point; shift: boolean }
  | { kind: 'marquee'; rect: Bounds; mode: MarqueeMode; operation: SelectOperation }
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

/**
 * The operation a marquee locks in from the modifiers held on the move sample that
 * flips the gesture from `pending` into `marquee`. Shift and Alt together add, Alt
 * alone subtracts, and Shift alone (the only remaining way to reach marquee mode)
 * replaces.
 */
function lockedMarqueeOperation(modifiers: { shift: boolean; alt?: boolean }): SelectOperation {
  if (modifiers.shift && modifiers.alt) return 'add'
  if (modifiers.alt) return 'subtract'
  return 'replace'
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

function resolveMarquee(
  state: SelectGestureState,
  sample: SelectMoveSample,
  operation: SelectOperation,
): SelectMoveResult {
  return {
    state: {
      mode: 'marquee',
      originWorld: state.originWorld,
      lastCanvas: sample.canvas,
      operation,
    },
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
    mode = sample.shift || sample.alt ? 'marquee' : 'panning'
  }
  if (mode === 'marquee') {
    const operation = state.mode === 'marquee' ? state.operation : lockedMarqueeOperation(sample)
    return resolveMarquee(state, sample, operation)
  }
  return resolvePanning(state, sample)
}

function marqueeMode(originWorld: Point, releaseWorld: Point): MarqueeMode {
  return releaseWorld.x < originWorld.x ? 'crossing' : 'window'
}

export function endSelectGesture(
  state: SelectGestureState,
  sample: SelectEndSample,
): SelectEndEffect {
  if (state.mode === 'panning') return { kind: 'none' }
  if (state.mode === 'marquee') {
    return {
      kind: 'marquee',
      rect: normalizedBounds(state.originWorld, sample.world),
      mode: marqueeMode(state.originWorld, sample.world),
      operation: state.operation,
    }
  }
  return { kind: 'click', world: state.originWorld, shift: sample.shift }
}
