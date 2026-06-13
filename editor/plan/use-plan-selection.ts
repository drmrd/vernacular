import { useRef, useState, type Dispatch, type PointerEvent, type SetStateAction } from 'react'
import type { Point, SceneGraph } from '../../core'
import type { SelectionStore } from '../../bridge'
import type { ToolId } from '../tools/active-tool-context'
import type { Bounds } from './fit'
import { hitTest, DEFAULT_HIT_TOLERANCE_MM } from './hit-test'
import { entitiesInRect } from './marquee'
import {
  advanceSelectGesture,
  beginSelectGesture,
  endSelectGesture,
  type SelectEndEffect,
  type SelectGestureState,
} from './select-gesture'
import { eventToCanvas } from './use-viewport-controls'
import { panBy, screenToWorld, type Viewport } from './viewport'

const PRIMARY_BUTTON = 0

interface PlanSelectionDeps {
  graph: SceneGraph
  selection: SelectionStore
  tool: ToolId
  viewport: Viewport
  setViewport: Dispatch<SetStateAction<Viewport>>
}

export interface PlanSelection {
  marquee: Bounds | undefined
  // True while a primary-button drag is panning the view, so the cursor can show the
  // closed hand. Middle-mouse and spacebar pans are tracked separately in the controls.
  panning: boolean
  onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => void
  onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => void
  onPointerUp: (event: PointerEvent<HTMLCanvasElement>) => void
}

// The mutable gesture state and the marquee/panning setters, bundled so the handlers
// stay a single parameter object beside their deps (mirrors use-selection-move).
interface GestureHandle {
  stateRef: { current: SelectGestureState | null }
  setMarquee: (marquee: Bounds | undefined) => void
  setPanning: (panning: boolean) => void
}

/** A bare click selects, toggles (with shift), or clears the selection. */
function applyClick(deps: PlanSelectionDeps, world: Point, shift: boolean): void {
  const hit = hitTest(deps.graph, world, DEFAULT_HIT_TOLERANCE_MM)
  if (hit === null) {
    if (!shift) {
      deps.selection.clear()
    }
    return
  }
  if (shift) {
    deps.selection.toggle(hit)
  } else {
    deps.selection.select(hit)
  }
}

/** Applies the release outcome: a click selects, a marquee replaces, a pan does nothing. */
function applyEndEffect(deps: PlanSelectionDeps, effect: SelectEndEffect): void {
  if (effect.kind === 'click') {
    applyClick(deps, effect.world, effect.shift)
  } else if (effect.kind === 'marquee') {
    deps.selection.setSelection(entitiesInRect(deps.graph, effect.rect))
  }
}

function releaseCapture(event: PointerEvent<HTMLCanvasElement>): void {
  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId)
  }
}

function pointerDown(
  deps: PlanSelectionDeps,
  handle: GestureHandle,
  event: PointerEvent<HTMLCanvasElement>,
): void {
  if (deps.tool !== 'select' || event.button !== PRIMARY_BUTTON) {
    return
  }
  const canvas = eventToCanvas(event, event.currentTarget)
  handle.stateRef.current = beginSelectGesture(screenToWorld(canvas, deps.viewport), canvas)
  event.currentTarget.setPointerCapture(event.pointerId)
}

function pointerMove(
  deps: PlanSelectionDeps,
  handle: GestureHandle,
  event: PointerEvent<HTMLCanvasElement>,
): void {
  const gesture = handle.stateRef.current
  if (gesture === null) {
    return
  }
  const canvas = eventToCanvas(event, event.currentTarget)
  const world = screenToWorld(canvas, deps.viewport)
  const result = advanceSelectGesture(gesture, { world, canvas, shift: event.shiftKey })
  handle.stateRef.current = result.state
  if (result.marquee) {
    handle.setMarquee(result.marquee)
  }
  const delta = result.panDelta
  if (delta) {
    deps.setViewport((viewport) => panBy(viewport, delta))
    handle.setPanning(true)
  }
}

function pointerUp(
  deps: PlanSelectionDeps,
  handle: GestureHandle,
  event: PointerEvent<HTMLCanvasElement>,
): void {
  const gesture = handle.stateRef.current
  handle.stateRef.current = null
  handle.setMarquee(undefined)
  handle.setPanning(false)
  releaseCapture(event)
  if (gesture === null) {
    return
  }
  const world = screenToWorld(eventToCanvas(event, event.currentTarget), deps.viewport)
  applyEndEffect(deps, endSelectGesture(gesture, { world, shift: event.shiftKey }))
}

/**
 * The select tool's primary-button pointer lifecycle, resolved by the pure
 * `select-gesture` machine: a plain drag pans the view, a Shift-drag rubber-bands a
 * marquee that replaces the selection on release, and a bare click selects,
 * shift-toggles, or clears. A press on an already-selected entity is grabbed earlier
 * by the move-drag, so this never sees it. Inert under any tool but `select`.
 */
export function usePlanSelection(deps: PlanSelectionDeps): PlanSelection {
  const stateRef = useRef<SelectGestureState | null>(null)
  const [marquee, setMarquee] = useState<Bounds | undefined>(undefined)
  const [panning, setPanning] = useState(false)
  const handle: GestureHandle = { stateRef, setMarquee, setPanning }
  return {
    marquee,
    panning,
    onPointerDown: (event) => pointerDown(deps, handle, event),
    onPointerMove: (event) => pointerMove(deps, handle, event),
    onPointerUp: (event) => pointerUp(deps, handle, event),
  }
}
